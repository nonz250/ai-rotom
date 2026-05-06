import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DamageCalculatorAdapter,
  conditionsSchema,
  pokemonSchema,
} from "@ai-rotom/shared";
import type { DamageCalcResult, PokemonInput } from "@ai-rotom/shared";
import { pokemonEntryProvider } from "../../data-store.js";
import {
  abilityNameResolver,
  itemNameResolver,
  moveNameResolver,
  natureNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "calculate_damage_with_protection";
const TOOL_DESCRIPTION =
  "防御側がマルチスケイル / ばけのかわ / きあいのタスキを持つ場合の累積ダメージ判定を行う。1 発目 + 2 発目を計算し、累積 % と確定 2 発 / 乱数 2 発 / 確 2 圏外 の判定を返す。calculate_damage_single の単発結果だけを見て「確 3 圏」と読んでしまう典型ミスを構造的に防ぐ。マルスケ持ちカイリュー等への打点評価で必ず使うこと。";

const inputSchema = {
  attacker: pokemonSchema.describe("攻撃側ポケモン"),
  defender: pokemonSchema.describe("防御側ポケモン"),
  moveName: z.string().describe("技名（日本語 or 英語）"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

type ProtectionType = "マルチスケイル" | "ばけのかわ" | "きあいのタスキ";

interface ProtectionPlan {
  hasProtection: boolean;
  protectionType?: ProtectionType;
  firstHitNote?: string;
  /** 1 発目を完全無効化 (ばけのかわ) */
  firstHitNullified?: boolean;
  /** 1 発目で残せる HP の最大 % (タスキは 99.9) */
  firstHitMaxResidualPct?: number;
  /** 2 発目以降の defender 状態 (ability/item を消費後仕様に書き換え) */
  secondHitDefender?: PokemonInput;
}

/**
 * defender の保護効果を検出する。pokechamp simulateProtection の TS 移植。
 * defender.ability / defender.item は日本語名前提 (pokemonSchema が日本語を許容)。
 */
function planProtection(defender: PokemonInput): ProtectionPlan {
  const ability = defender.ability;
  const item = defender.item;

  if (ability === "マルチスケイル" || ability === "Multiscale") {
    return {
      hasProtection: true,
      protectionType: "マルチスケイル",
      firstHitNote: "満タン時 1/2",
      secondHitDefender: { ...defender, ability: "プレッシャー" },
    };
  }
  if (ability === "ばけのかわ" || ability === "Disguise") {
    return {
      hasProtection: true,
      protectionType: "ばけのかわ",
      firstHitNote: "完全無効 (1 発分吸収 + HP 1/8 減)",
      firstHitNullified: true,
      secondHitDefender: { ...defender, ability: "プレッシャー" },
    };
  }
  if (item === "きあいのタスキ" || item === "Focus Sash") {
    return {
      hasProtection: true,
      protectionType: "きあいのタスキ",
      firstHitNote: "満タン時 HP 1 残し",
      firstHitMaxResidualPct: 99.9,
      secondHitDefender: { ...defender, item: undefined },
    };
  }
  return { hasProtection: false };
}

function createCalculator(): DamageCalculatorAdapter {
  return new DamageCalculatorAdapter(
    {
      pokemon: pokemonNameResolver,
      move: moveNameResolver,
      ability: abilityNameResolver,
      item: itemNameResolver,
      nature: natureNameResolver,
    },
    pokemonEntryProvider,
  );
}

interface FirstHitSummary {
  range: string;
  ko: string;
  typeMult: number;
  minPct: number;
  maxPct: number;
  effectiveRange?: string;
  effectiveMinPct?: number;
  effectiveMaxPct?: number;
}

interface SecondHitSummary {
  range: string;
  ko: string;
  typeMult: number;
  minPct: number;
  maxPct: number;
}

interface AccumulatedSummary {
  range: string;
  ko: "確定2発" | "乱数2発" | "確2圏外 (3発以上必要)";
  minPct: number;
  maxPct: number;
}

interface ProtectionResult {
  firstHit: FirstHitSummary;
  secondHit: SecondHitSummary | null;
  accumulated: AccumulatedSummary | null;
  protection: { type: ProtectionType; firstHitNote: string } | null;
}

function summarizeFirst(r: DamageCalcResult): FirstHitSummary {
  return {
    range: `${r.minPercent.toFixed(1)}-${r.maxPercent.toFixed(1)}%`,
    ko: r.koChance,
    typeMult: r.typeMultiplier,
    minPct: r.minPercent,
    maxPct: r.maxPercent,
  };
}

export function registerCalculateDamageWithProtectionTool(
  server: McpServer,
): void {
  const calculator = createCalculator();

  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const r1 = calculator.calculate({
        attacker: args.attacker,
        defender: args.defender,
        moveName: args.moveName,
        conditions: args.conditions,
      });
      const firstHit = summarizeFirst(r1);

      // 無効技 (typeMult = 0) は protection 評価不要
      if (r1.typeMultiplier === 0) {
        const out: ProtectionResult = {
          firstHit: { ...firstHit, range: "無効", effectiveRange: "無効" },
          secondHit: null,
          accumulated: null,
          protection: null,
        };
        return withHint({ type: "text" as const, text: JSON.stringify(out) });
      }

      const plan = planProtection(args.defender);
      if (!plan.hasProtection || !plan.secondHitDefender) {
        const out: ProtectionResult = {
          firstHit,
          secondHit: null,
          accumulated: null,
          protection: null,
        };
        return withHint({ type: "text" as const, text: JSON.stringify(out) });
      }

      const r2 = calculator.calculate({
        attacker: args.attacker,
        defender: plan.secondHitDefender,
        moveName: args.moveName,
        conditions: args.conditions,
      });
      const secondHit: SecondHitSummary = {
        range: `${r2.minPercent.toFixed(1)}-${r2.maxPercent.toFixed(1)}%`,
        ko: r2.koChance,
        typeMult: r2.typeMultiplier,
        minPct: r2.minPercent,
        maxPct: r2.maxPercent,
      };

      // 1 発目で実際に通る effective range を保護効果に応じて補正
      let effMin: number;
      let effMax: number;
      let effRangeLabel: string;
      if (plan.firstHitNullified) {
        effMin = 0;
        effMax = 0;
        effRangeLabel = "無効 (ばけのかわで吸収)";
      } else if (plan.firstHitMaxResidualPct !== undefined) {
        const cap = plan.firstHitMaxResidualPct;
        effMin = Math.min(firstHit.minPct, cap);
        effMax = Math.min(firstHit.maxPct, cap);
        effRangeLabel =
          firstHit.minPct >= 100
            ? `${cap.toFixed(1)}% (タスキで HP 1 残し)`
            : `${effMin.toFixed(1)}-${effMax.toFixed(1)}%`;
      } else {
        effMin = firstHit.minPct;
        effMax = firstHit.maxPct;
        effRangeLabel = `${effMin.toFixed(1)}-${effMax.toFixed(1)}% (マルスケ込み)`;
      }
      firstHit.effectiveRange = effRangeLabel;
      firstHit.effectiveMinPct = effMin;
      firstHit.effectiveMaxPct = effMax;

      const accMin = effMin + secondHit.minPct;
      const accMax = effMax + secondHit.maxPct;
      const accKO: AccumulatedSummary["ko"] =
        accMin >= 100
          ? "確定2発"
          : accMax >= 100
            ? "乱数2発"
            : "確2圏外 (3発以上必要)";

      const out: ProtectionResult = {
        firstHit,
        secondHit,
        accumulated: {
          range: `${accMin.toFixed(1)}-${accMax.toFixed(1)}%`,
          ko: accKO,
          minPct: accMin,
          maxPct: accMax,
        },
        protection: {
          type: plan.protectionType!,
          firstHitNote: plan.firstHitNote!,
        },
      };
      return withHint({ type: "text" as const, text: JSON.stringify(out) });
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}
