import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PokemonInput } from "@ai-rotom/shared";
import { pokemonById, toDataId } from "../../data-store.js";
import { pokemonNameResolver } from "../../name-resolvers.js";
import {
  fetchMetaTop,
  fetchPokemonMeta,
  fetchTypicalSet,
  normalizePokedbItem,
  normalizePokedbSpecies,
} from "../../services/pokedb-client.js";
import type {
  MetaTopEntry,
  PokemonMeta,
  TypicalSet,
} from "../../services/pokedb-client.js";
import { resolveMegaStone } from "../../services/mega-resolver.js";
import { createDamageCalculator } from "../../services/calculator-factory.js";
import { calculateWithProtection } from "../../services/protection.js";
import { moveTypeByName } from "../../services/pokemon-helpers.js";
import { typeMultiplierLabel } from "../../services/type-label.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "analyze_party_vs_meta";
const TOOL_DESCRIPTION =
  "自パーティ vs 環境上位 N 体の苦手枠スキャン。各環境ポケモン (主流型ごと) に対して、自パーティの全技で 50% 以上削れる打点が何個あるかを計算し、危険 (0個) / 不利 (1個) / 有利 (2個以上) に分類する。マルスケ / ばけのかわ / タスキの累積判定込み。仮想敵は最頻アイテムが「〜ナイト」ならメガ進化前提で構築。メガポケモンを 2 体以上持つ場合は両 ver で分割して構造的詰みを浮上させる。構築相談の Step 6 で必須。";

// pokemonSchema は moves フィールドを持たないため (打点は別ツールで指定する設計)、
// analyze_party_vs_meta では moves 必須の専用スキーマを定義する。
// 他フィールドは shared の PokemonInput と同じ shape を保つ。
const partyMemberSchema = z
  .object({
    name: z.string().describe("ポケモン名 (日本語 or 英語)"),
    nature: z.string().optional().describe("性格名"),
    ability: z.string().optional().describe("特性名"),
    item: z.string().optional().describe("持ち物名"),
    evs: z
      .object({
        hp: z.number().int().min(0).max(32).optional(),
        atk: z.number().int().min(0).max(32).optional(),
        def: z.number().int().min(0).max(32).optional(),
        spa: z.number().int().min(0).max(32).optional(),
        spd: z.number().int().min(0).max(32).optional(),
        spe: z.number().int().min(0).max(32).optional(),
      })
      .optional()
      .describe("能力ポイント (各ステ 0-32 / 合計 0-66)"),
    moves: z
      .array(z.string())
      .min(1)
      .max(4)
      .describe("覚えている技 1〜4 個 (技名は日本語 or 英語)"),
  })
  .passthrough();

const inputSchema = {
  party: z.array(partyMemberSchema).min(1).max(6).describe("自パーティ (1〜6 体)"),
  depth: z
    .number()
    .int()
    .min(5)
    .max(200)
    .default(50)
    .describe("環境上位の調査範囲 (1-200, デフォルト 50)"),
  threshold: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("「有効打点」と見なす最低ダメージ % (デフォルト 50%)"),
};

const calculator = createDamageCalculator();

interface ProtectedAttempt {
  poke: string;
  move: string;
  moveType: string | null;
  typeMult: number;
  range: string;
  minPct: number;
  maxPct: number;
  protection?: { type: string; firstHitNote: string };
  firstHitEffective?: string;
  secondHit?: string;
  accumulated?: string;
  accumulatedKO?: string;
}

interface OpponentThreat {
  attackerMove: string;
  moveSharePct: number;
  moveType: string | null;
  defender: string;
  typeMult: number;
  typeMultLabel: string;
  range: string;
  minPct: number;
  protection?: { type: string; firstHitNote: string };
  firstHitEffective?: string;
  accumulated?: string;
  accumulatedKO?: string;
}

interface EntryEvaluation {
  rank: number;
  name: string;
  variant: string;
  sharePct: number;
  hits: ProtectedAttempt[];
  defenderUsed: {
    name: string;
    ability: string | null;
    item: string | null;
    isMega: boolean;
    assumedNature: string | null;
    assumedEvs: Record<string, number>;
    assumptionNote: string;
  };
  topAttempts: ProtectedAttempt[];
  opponentThreats: OpponentThreat[];
}

interface SingleResult {
  danger: EntryEvaluation[];
  weak: EntryEvaluation[];
  ok: EntryEvaluation[];
}

/** 仮想敵の defender 設定。最頻アイテムがメガストーンならメガ前提。 */
function buildEnemyDefender(
  enemyJa: string,
  meta: PokemonMeta,
  variantNature: string,
): PokemonInput | null {
  const speciesJa = normalizePokedbSpecies(enemyJa);
  const en = pokemonNameResolver.toEnglish(speciesJa);
  if (!en) return null;
  const baseEntry = pokemonById.get(toDataId(en));
  if (!baseEntry) return null;

  const top1 = meta.items[0];
  if (!top1 || !/ナイト[ＸＹXY]?$/.test(top1.name)) {
    return {
      name: speciesJa,
      nature: variantNature,
      evs: { hp: 32 },
    };
  }

  const stoneJa = normalizePokedbItem(top1.name);
  const mega = resolveMegaStone(stoneJa);
  if (!mega) {
    return { name: speciesJa, nature: variantNature, evs: { hp: 32 } };
  }
  return {
    name: mega.speciesJa,
    nature: variantNature,
    ability: mega.abilityJa ?? undefined,
    item: stoneJa,
    evs: { hp: 32 },
  };
}

async function analyzeSingle(
  team: PokemonInput[],
  top: MetaTopEntry[],
  threshold: number,
): Promise<SingleResult> {
  const danger: EntryEvaluation[] = [];
  const weak: EntryEvaluation[] = [];
  const ok: EntryEvaluation[] = [];

  for (const enemy of top) {
    let typical: TypicalSet;
    let meta: PokemonMeta;
    try {
      [typical, meta] = await Promise.all([
        fetchTypicalSet(enemy.ja),
        fetchPokemonMeta(enemy.ja),
      ]);
    } catch {
      continue;
    }
    if (typical.variants.length === 0) continue;

    for (const variant of typical.variants) {
      const defenderConfig = buildEnemyDefender(enemy.ja, meta, variant.nature);
      if (!defenderConfig) continue;

      const allAttempts: ProtectedAttempt[] = [];
      const hits: ProtectedAttempt[] = [];

      for (const myPoke of team) {
        for (const move of myPoke.moves ?? []) {
          let calc;
          try {
            calc = calculateWithProtection(calculator, myPoke, defenderConfig, move);
          } catch {
            continue;
          }
          if (calc.firstHit.typeMultiplier === 0) continue;
          const minPct = calc.firstHit.minPercent;
          const maxPct = calc.firstHit.maxPercent;
          const attempt: ProtectedAttempt = {
            poke: myPoke.name,
            move,
            moveType: moveTypeByName(move),
            typeMult: calc.firstHit.typeMultiplier,
            range: `${minPct.toFixed(1)}-${maxPct.toFixed(1)}%`,
            minPct,
            maxPct,
          };
          if (calc.accumulated && calc.protection) {
            attempt.protection = calc.protection;
            attempt.firstHitEffective = calc.effRangeLabel;
            attempt.secondHit = calc.secondHit
              ? `${calc.secondHit.minPercent.toFixed(1)}-${calc.secondHit.maxPercent.toFixed(1)}%`
              : undefined;
            attempt.accumulated = calc.accumulated.range;
            attempt.accumulatedKO = calc.accumulated.ko;
          }
          allAttempts.push(attempt);
          const effectiveMin = calc.accumulated ? calc.accumulated.minPct : minPct;
          if (effectiveMin >= threshold) {
            hits.push(attempt);
          }
        }
      }

      const topAttempts = [...allAttempts]
        .sort((a, b) => {
          const aMin = a.accumulated ? parseFloat(a.accumulated.split("-")[0]!) : a.minPct;
          const bMin = b.accumulated ? parseFloat(b.accumulated.split("-")[0]!) : b.minPct;
          return bMin - aMin;
        })
        .slice(0, 3);

      // 相手→自分の打点 (上位 2 技)
      const oppMoves = meta.moves
        .filter((m) => {
          const mt = moveTypeByName(m.name);
          if (!mt) return false;
          const en = pokemonNameResolver.toEnglish(m.name) ?? m.name;
          // basePower > 0 (攻撃技のみ) は moveTypeByName が type 取れた時点で
          // 大半が攻撃技。念のため movesById からも確認するが省略可。
          void en;
          return true;
        })
        .slice(0, 2);
      const opponentThreats: OpponentThreat[] = [];
      for (const oppMove of oppMoves) {
        for (const myPoke of team) {
          let calc;
          try {
            calc = calculateWithProtection(calculator, defenderConfig, myPoke, oppMove.name);
          } catch {
            continue;
          }
          const moveType = moveTypeByName(oppMove.name);
          if (calc.firstHit.typeMultiplier === 0) {
            opponentThreats.push({
              attackerMove: oppMove.name,
              moveSharePct: oppMove.percentage,
              moveType,
              defender: myPoke.name,
              typeMult: 0,
              typeMultLabel: "無効",
              range: "無効",
              minPct: 0,
            });
            continue;
          }
          const threat: OpponentThreat = {
            attackerMove: oppMove.name,
            moveSharePct: oppMove.percentage,
            moveType,
            defender: myPoke.name,
            typeMult: calc.firstHit.typeMultiplier,
            typeMultLabel: typeMultiplierLabel(calc.firstHit.typeMultiplier),
            range: `${calc.firstHit.minPercent.toFixed(1)}-${calc.firstHit.maxPercent.toFixed(1)}%`,
            minPct: calc.firstHit.minPercent,
          };
          if (calc.accumulated && calc.protection) {
            threat.protection = calc.protection;
            threat.firstHitEffective = calc.effRangeLabel;
            threat.accumulated = calc.accumulated.range;
            threat.accumulatedKO = calc.accumulated.ko;
          }
          opponentThreats.push(threat);
        }
      }
      opponentThreats.sort((a, b) => {
        const aMin = a.accumulated ? parseFloat(a.accumulated.split("-")[0]!) : a.minPct;
        const bMin = b.accumulated ? parseFloat(b.accumulated.split("-")[0]!) : b.minPct;
        return bMin - aMin;
      });

      const entry: EntryEvaluation = {
        rank: enemy.rank,
        name: enemy.ja,
        variant: variant.label,
        sharePct: variant.sharePct,
        hits,
        defenderUsed: {
          name: defenderConfig.name,
          ability: defenderConfig.ability ?? null,
          item: defenderConfig.item ?? null,
          isMega: defenderConfig.name.startsWith("メガ"),
          assumedNature: defenderConfig.nature ?? null,
          assumedEvs: (defenderConfig.evs ?? {}) as Record<string, number>,
          assumptionNote:
            "H32 振り、A/B/C/D/S は無振り想定。実戦相手は攻撃振り・耐久振りで数値が変動する",
        },
        topAttempts,
        opponentThreats: opponentThreats.slice(0, 5),
      };
      if (hits.length === 0) danger.push(entry);
      else if (hits.length === 1) weak.push(entry);
      else ok.push(entry);
    }
  }
  return { danger, weak, ok };
}

interface MultiMegaVersion {
  megaName: string;
  team: PokemonInput[];
  result: SingleResult;
}

interface AnalyzeOutput {
  mode: "single" | "multi-mega";
  summary: Record<string, number | string | string[]>;
  danger?: EntryEvaluation[];
  weak?: EntryEvaluation[];
  ok?: EntryEvaluation[];
  structuralDanger?: EntryEvaluation[];
  megaDependentDanger?: (EntryEvaluation & { dangerInVersions: string[] })[];
  versions?: MultiMegaVersion[];
}

export function registerAnalyzePartyVsMetaTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const top = await fetchMetaTop(args.depth);
      const team = args.party;

      const megaIndices = team
        .map((p, i) => (p.name?.startsWith("メガ") ? i : -1))
        .filter((i) => i >= 0);

      if (megaIndices.length >= 2) {
        const versions: MultiMegaVersion[] = [];
        for (const keepIdx of megaIndices) {
          const subTeam = team.filter(
            (_, i) => !megaIndices.includes(i) || i === keepIdx,
          );
          versions.push({
            megaName: team[keepIdx]!.name,
            team: subTeam,
            result: await analyzeSingle(subTeam, top, args.threshold),
          });
        }

        const allKeys = new Set<string>();
        versions.forEach((v) => {
          v.result.danger.forEach((d) => allKeys.add(`${d.rank}:${d.variant}`));
          v.result.weak.forEach((d) => allKeys.add(`${d.rank}:${d.variant}`));
        });

        const structuralDanger: EntryEvaluation[] = [];
        const megaDependentDanger: (EntryEvaluation & { dangerInVersions: string[] })[] = [];
        for (const key of allKeys) {
          const inAll = versions.every((v) =>
            v.result.danger.find((d) => `${d.rank}:${d.variant}` === key),
          );
          const inSome = versions.some((v) =>
            v.result.danger.find((d) => `${d.rank}:${d.variant}` === key),
          );
          if (inAll) {
            const sample = versions[0]!.result.danger.find(
              (d) => `${d.rank}:${d.variant}` === key,
            );
            if (sample) structuralDanger.push(sample);
          } else if (inSome) {
            const verNames = versions
              .filter((v) =>
                v.result.danger.find((d) => `${d.rank}:${d.variant}` === key),
              )
              .map((v) => v.megaName);
            const sourceVer = versions.find((v) =>
              v.result.danger.find((d) => `${d.rank}:${d.variant}` === key),
            );
            const sample = sourceVer?.result.danger.find(
              (d) => `${d.rank}:${d.variant}` === key,
            );
            if (sample) {
              megaDependentDanger.push({ ...sample, dangerInVersions: verNames });
            }
          }
        }

        const out: AnalyzeOutput = {
          mode: "multi-mega",
          summary: {
            depth: args.depth,
            threshold: args.threshold,
            megaVersions: versions.map((v) => v.megaName),
            structuralDanger: structuralDanger.length,
            megaDependentDanger: megaDependentDanger.length,
          },
          structuralDanger,
          megaDependentDanger,
          versions,
        };
        return withHint({ type: "text" as const, text: JSON.stringify(out) });
      }

      const single = await analyzeSingle(team, top, args.threshold);
      const out: AnalyzeOutput = {
        mode: "single",
        summary: {
          depth: args.depth,
          threshold: args.threshold,
          total: single.danger.length + single.weak.length + single.ok.length,
          danger: single.danger.length,
          weak: single.weak.length,
          ok: single.ok.length,
        },
        danger: single.danger,
        weak: single.weak,
        ok: single.ok,
      };
      return withHint({ type: "text" as const, text: JSON.stringify(out) });
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}
