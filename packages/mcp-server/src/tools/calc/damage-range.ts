import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  MAX_STAT_POINT_PER_STAT,
  MAX_STAT_POINT_TOTAL,
  conditionsSchema,
  pokemonSchema,
} from "@ai-rotom/shared";
import { DamageCalculatorAdapter } from "../../calc/damage-calculator.js";
import type {
  ConditionsInput,
  DamageCalcResult,
  PokemonInput,
} from "../../calc/damage-calculator.js";
import type { MoveCategory } from "../../data-store.js";
import { movesById, toDataId } from "../../data-store.js";
import {
  abilityNameResolver,
  itemNameResolver,
  moveNameResolver,
  natureNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";

/** 探索に使う SP 候補ステップ（細かさ）。4 きざみで枝刈り → hit したら 1 きざみで微調整 */
const SP_COARSE_STEP = 4;
const SP_FINE_STEP = 1;

const TOOL_NAME = "analyze_damage_range";
const TOOL_DESCRIPTION =
  "ダメージ計算を逆引きして、防御側を耐えさせるために必要な最小 SP 配分を探索する。"
  + "`damage` には min/max ダメージと % を、`nHitKo` には確定 X 発の数を、"
  + "`survivalSpConfig` には確定耐えに必要な最小 SP 配分を返す。"
  + "ポケモンチャンピオンズ仕様（SP 各 0-32 / 合計 0-66）で計算。";

const inputSchema = {
  attacker: pokemonSchema.describe("攻撃側ポケモン"),
  defender: pokemonSchema.describe("防御側ポケモン"),
  moveName: z.string().describe("技名（日本語 or 英語）"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

interface DamageInfo {
  min: number;
  max: number;
  percentage: { min: number; max: number };
}

interface SurvivalSpConfig {
  hpSp: number;
  defenseSp: number;
  /** SP 振り後に Plus の性格補正を適用するとさらに有利になる場合の候補 */
  naturePlus: "def" | "spd" | "hp" | null;
}

export interface DamageRangeOutput {
  damage: DamageInfo;
  ohkoChance: number;
  nHitKo: number;
  survivalSpConfig: SurvivalSpConfig | null;
  moveCategory: MoveCategory;
  /** 基準となるダメージ計算結果。0 ダメージ技（無効タイプ等）の場合は null */
  baseResult: DamageCalcResult | null;
}

type DefenseStatKey = "def" | "spd";

/**
 * 単発 OHKO 確率（0-1）を計算する。
 * 16 本のダメージ乱数のうち、HP 以上のダメージが何本あるかで確率を出す。
 */
function calculateOhkoChance(damages: number[], maxHp: number): number {
  if (damages.length === 0) return 0;
  const ohkoHits = damages.filter((d) => d >= maxHp).length;
  return ohkoHits / damages.length;
}

/**
 * 確定 N 発を算出する。
 * 「minDamage で倒しきる最少発数」= ceil(HP / minDamage) を返す。
 * minDamage === 0 の場合は Infinity（倒せない）。
 */
function calculateNHitKo(damages: number[], maxHp: number): number {
  if (damages.length === 0) return Number.POSITIVE_INFINITY;
  const minDamage = Math.min(...damages);
  if (minDamage <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(maxHp / minDamage);
}

/**
 * 単発で耐えられるかを判定する。
 * maxDamage < 現在 HP ならば確定耐え。
 */
function survivesSingleHit(
  maxDamage: number,
  currentHp: number,
): boolean {
  return maxDamage < currentHp;
}

/**
 * ある SP 配分で単発耐えが成立するか試す。
 */
function trySurvive(
  calculator: DamageCalculatorAdapter,
  attacker: PokemonInput,
  defender: PokemonInput,
  moveName: string,
  conditions: ConditionsInput | undefined,
  hpSp: number,
  defenseSp: number,
  defenseKey: DefenseStatKey,
): { survived: boolean; result: DamageCalcResult | null } {
  const testDefender: PokemonInput = {
    ...defender,
    evs: {
      ...defender.evs,
      hp: hpSp,
      [defenseKey]: defenseSp,
    },
  };

  try {
    const result = calculator.calculate({
      attacker,
      defender: testDefender,
      moveName,
      conditions,
    });

    // calculator から maxHp を再取得するために createPokemonObject を使う
    const { pokemon: defObj } = calculator.createPokemonObject(testDefender);
    const survived = survivesSingleHit(result.max, defObj.maxHP());
    return { survived, result };
  } catch {
    // ダメージが全 0（無効タイプ等）で calculate が例外を投げた場合は「耐えた」扱い
    return { survived: true, result: null };
  }
}

/**
 * 技カテゴリから、防御側に振るべきステを決定する。
 */
function defenseKeyForMove(category: MoveCategory): DefenseStatKey {
  return category === "Special" ? "spd" : "def";
}

/**
 * 最小 SP 配分を探索する。
 * 合計 ≤ MAX_STAT_POINT_TOTAL、各 ≤ MAX_STAT_POINT_PER_STAT の範囲で
 * 「hpSp + defenseSp」の合計が最小になる組み合わせを返す。
 * 見つからない場合は null。
 *
 * 実装方針:
 *   totalCap を 0 → MAX_STAT_POINT_TOTAL に増やしながら、
 *   その内側で (hpSp, defenseSp) 全組を試し、最初に耐えた組を返す。
 *   SP は 0-32 なので最大 33*33 = 1089 通り/totalCap、
 *   calculator 呼び出しは重いので coarse (STEP=4) → fine (STEP=1) で段階的に絞る。
 */
function findMinimalSurvivalSp(
  calculator: DamageCalculatorAdapter,
  attacker: PokemonInput,
  defender: PokemonInput,
  moveName: string,
  conditions: ConditionsInput | undefined,
  defenseKey: DefenseStatKey,
): SurvivalSpConfig | null {
  // Phase 1: coarse 探索で「耐えられる合計値」の目安を探す
  const coarseSpValues: number[] = [];
  for (let sp = 0; sp <= MAX_STAT_POINT_PER_STAT; sp += SP_COARSE_STEP) {
    coarseSpValues.push(sp);
  }
  if (coarseSpValues[coarseSpValues.length - 1] !== MAX_STAT_POINT_PER_STAT) {
    coarseSpValues.push(MAX_STAT_POINT_PER_STAT);
  }

  let coarseBest: { hpSp: number; defenseSp: number } | null = null;

  outer: for (const hpSp of coarseSpValues) {
    for (const defSp of coarseSpValues) {
      if (hpSp + defSp > MAX_STAT_POINT_TOTAL) continue;
      const { survived } = trySurvive(
        calculator,
        attacker,
        defender,
        moveName,
        conditions,
        hpSp,
        defSp,
        defenseKey,
      );
      if (survived) {
        coarseBest = { hpSp, defenseSp: defSp };
        break outer;
      }
    }
  }

  if (coarseBest === null) {
    // coarse で耐えられる候補が見つからない場合、最大振りで試す
    const { survived } = trySurvive(
      calculator,
      attacker,
      defender,
      moveName,
      conditions,
      MAX_STAT_POINT_PER_STAT,
      MAX_STAT_POINT_PER_STAT,
      defenseKey,
    );
    if (!survived) {
      return null;
    }
    coarseBest = {
      hpSp: MAX_STAT_POINT_PER_STAT,
      defenseSp: MAX_STAT_POINT_PER_STAT,
    };
  }

  // Phase 2: coarse で見つかった上限内で fine 探索
  const maxHpTry = Math.min(
    coarseBest.hpSp + SP_COARSE_STEP,
    MAX_STAT_POINT_PER_STAT,
  );
  const maxDefTry = Math.min(
    coarseBest.defenseSp + SP_COARSE_STEP,
    MAX_STAT_POINT_PER_STAT,
  );

  let best: { hpSp: number; defenseSp: number } = coarseBest;
  let bestTotal = coarseBest.hpSp + coarseBest.defenseSp;

  for (let hpSp = 0; hpSp <= maxHpTry; hpSp += SP_FINE_STEP) {
    for (let defSp = 0; defSp <= maxDefTry; defSp += SP_FINE_STEP) {
      if (hpSp + defSp > MAX_STAT_POINT_TOTAL) continue;
      if (hpSp + defSp >= bestTotal) continue;

      const { survived } = trySurvive(
        calculator,
        attacker,
        defender,
        moveName,
        conditions,
        hpSp,
        defSp,
        defenseKey,
      );
      if (survived) {
        best = { hpSp, defenseSp: defSp };
        bestTotal = hpSp + defSp;
      }
    }
  }

  return {
    hpSp: best.hpSp,
    defenseSp: best.defenseSp,
    naturePlus: null,
  };
}

export function registerDamageRangeTool(server: McpServer): void {
  const calculator = new DamageCalculatorAdapter({
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  });

  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      // 技カテゴリを取得
      const moveEn =
        moveNameResolver.toEnglish(args.moveName) ??
        (moveNameResolver.hasEnglishName(args.moveName)
          ? args.moveName
          : null);
      if (moveEn === null) {
        const suggestions = moveNameResolver.suggestSimilar(args.moveName);
        const suggestionMessage =
          suggestions.length > 0
            ? ` もしかして: ${suggestions.join(", ")}`
            : "";
        throw new Error(
          `技「${args.moveName}」が見つかりません。${suggestionMessage}`,
        );
      }
      const moveEntry = movesById.get(toDataId(moveEn));
      if (moveEntry === undefined) {
        throw new Error(
          `技「${args.moveName}」はチャンピオンズでは使用できません。`,
        );
      }

      // 防御側 HP を取得
      const { pokemon: defObj } = calculator.createPokemonObject(args.defender);
      const defenderMaxHp = defObj.maxHP();

      // ベースライン（入力通り）のダメージ計算。
      // 0 ダメ（無効タイプ等）の場合は @smogon/calc が例外を投げるので捕捉してフォールバックする。
      let baseResult: DamageCalcResult | null = null;
      try {
        baseResult = calculator.calculate({
          attacker: args.attacker,
          defender: args.defender,
          moveName: args.moveName,
          conditions: args.conditions,
        });
      } catch {
        baseResult = null;
      }

      const ohkoChance =
        baseResult !== null
          ? calculateOhkoChance(baseResult.damage, defenderMaxHp)
          : 0;
      const nHitKoRaw =
        baseResult !== null
          ? calculateNHitKo(baseResult.damage, defenderMaxHp)
          : Number.POSITIVE_INFINITY;
      const nHitKo = Number.isFinite(nHitKoRaw) ? nHitKoRaw : 0;

      // 変化技は survivalSpConfig 計算しない。0 ダメ技も計算不要（常に耐える）。
      let survivalSpConfig: SurvivalSpConfig | null = null;
      if (moveEntry.category !== "Status" && baseResult !== null) {
        const defenseKey = defenseKeyForMove(moveEntry.category);
        survivalSpConfig = findMinimalSurvivalSp(
          calculator,
          args.attacker,
          args.defender,
          args.moveName,
          args.conditions,
          defenseKey,
        );
      }

      const output: DamageRangeOutput = {
        damage:
          baseResult !== null
            ? {
                min: baseResult.min,
                max: baseResult.max,
                percentage: {
                  min: baseResult.minPercent,
                  max: baseResult.maxPercent,
                },
              }
            : { min: 0, max: 0, percentage: { min: 0, max: 0 } },
        ohkoChance,
        nHitKo,
        survivalSpConfig,
        moveCategory: moveEntry.category,
        baseResult,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "不明なエラーが発生しました";
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: message }) },
        ],
        isError: true,
      };
    }
  });
}
