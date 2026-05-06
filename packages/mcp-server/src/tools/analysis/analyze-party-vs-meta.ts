import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DamageCalculatorAdapter,
  pokemonSchema,
} from "@ai-rotom/shared";
import type { DamageCalcResult, PokemonInput } from "@ai-rotom/shared";
import {
  movesById,
  pokemonById,
  pokemonEntryProvider,
  toDataId,
} from "../../data-store.js";
import {
  abilityNameResolver,
  itemNameResolver,
  moveNameResolver,
  natureNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";
import {
  fetchMetaTop,
  fetchPokemonMeta,
  fetchTypicalSet,
  normalizePokedbItem,
  normalizePokedbSpecies,
} from "../../services/pokedb-client.js";
import type { MetaTopEntry, PokemonMeta, TypicalSet } from "../../services/pokedb-client.js";
import { resolveMegaStone } from "../../services/mega-resolver.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "analyze_party_vs_meta";
const TOOL_DESCRIPTION =
  "自パーティ vs 環境上位 N 体の苦手枠スキャン。各環境ポケモン (主流型ごと) に対して、自パーティの全技で 50% 以上削れる打点が何個あるかを計算し、危険 (0個) / 不利 (1個) / 有利 (2個以上) に分類する。マルスケ / ばけのかわ / タスキの累積判定込み。仮想敵は最頻アイテムが「〜ナイト」ならメガ進化前提で構築。メガポケモンを 2 体以上持つ場合は両 ver で分割して構造的詰みを浮上させる。構築相談の Step 6 で必須。";

const inputSchema = {
  party: z.array(pokemonSchema).describe("自パーティ (1〜6 体)"),
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

const calculator = createCalculator();

const TYPE_LABEL = (mult: number): string => {
  if (mult === 0) return "無効";
  if (mult === 4) return "4倍弱点";
  if (mult === 2) return "2倍弱点";
  if (mult === 1) return "等倍";
  if (mult === 0.5) return "半減";
  if (mult === 0.25) return "1/4";
  return `${mult}x`;
};

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

/** 仮想敵の defender 設定を組み立てる。最頻アイテムがメガストーンならメガ前提。 */
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

/** 1 発目 + 累積判定込みの簡易ダメ計。calc-with-protection ツールと同じロジックの局所版。 */
function calcOnceWithProtection(
  attacker: PokemonInput,
  defender: PokemonInput,
  moveJa: string,
): {
  firstHit: DamageCalcResult;
  protection?: { type: string; firstHitNote: string };
  effRangeLabel?: string;
  effMin?: number;
  effMax?: number;
  secondHit?: DamageCalcResult;
  accumulated?: { range: string; ko: string; minPct: number; maxPct: number };
} {
  const r1 = calculator.calculate({
    attacker,
    defender,
    moveName: moveJa,
  });
  if (r1.typeMultiplier === 0) {
    return { firstHit: r1 };
  }

  let secondDefender: PokemonInput | null = null;
  let protType: string | null = null;
  let firstHitNote = "";
  let firstHitNullified = false;
  let firstHitMaxResidual: number | null = null;

  if (defender.ability === "マルチスケイル" || defender.ability === "Multiscale") {
    secondDefender = { ...defender, ability: "プレッシャー" };
    protType = "マルチスケイル";
    firstHitNote = "満タン時 1/2";
  } else if (defender.ability === "ばけのかわ" || defender.ability === "Disguise") {
    secondDefender = { ...defender, ability: "プレッシャー" };
    protType = "ばけのかわ";
    firstHitNote = "完全無効";
    firstHitNullified = true;
  } else if (defender.item === "きあいのタスキ" || defender.item === "Focus Sash") {
    secondDefender = { ...defender, item: undefined };
    protType = "きあいのタスキ";
    firstHitNote = "満タン時 HP 1 残し";
    firstHitMaxResidual = 99.9;
  }

  if (!secondDefender || !protType) return { firstHit: r1 };

  const r2 = calculator.calculate({
    attacker,
    defender: secondDefender,
    moveName: moveJa,
  });

  let effMin: number;
  let effMax: number;
  let effRangeLabel: string;
  if (firstHitNullified) {
    effMin = 0;
    effMax = 0;
    effRangeLabel = "無効 (ばけのかわで吸収)";
  } else if (firstHitMaxResidual !== null) {
    const cap = firstHitMaxResidual;
    effMin = Math.min(r1.minPercent, cap);
    effMax = Math.min(r1.maxPercent, cap);
    effRangeLabel =
      r1.minPercent >= 100
        ? `${cap.toFixed(1)}% (タスキで HP 1 残し)`
        : `${effMin.toFixed(1)}-${effMax.toFixed(1)}%`;
  } else {
    effMin = r1.minPercent;
    effMax = r1.maxPercent;
    effRangeLabel = `${effMin.toFixed(1)}-${effMax.toFixed(1)}% (マルスケ込み)`;
  }
  const accMin = effMin + r2.minPercent;
  const accMax = effMax + r2.maxPercent;
  const accKO = accMin >= 100 ? "確定2発" : accMax >= 100 ? "乱数2発" : "確2圏外";
  return {
    firstHit: r1,
    secondHit: r2,
    protection: { type: protType, firstHitNote },
    effRangeLabel,
    effMin,
    effMax,
    accumulated: {
      range: `${accMin.toFixed(1)}-${accMax.toFixed(1)}%`,
      ko: accKO,
      minPct: accMin,
      maxPct: accMax,
    },
  };
}

function moveTypeOfJa(moveJa: string): string | null {
  const en = moveNameResolver.toEnglish(moveJa) ?? (moveNameResolver.hasEnglishName(moveJa) ? moveJa : null);
  if (!en) return null;
  return movesById.get(toDataId(en))?.type ?? null;
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
            calc = calcOnceWithProtection(myPoke, defenderConfig, move);
          } catch {
            continue;
          }
          if (calc.firstHit.typeMultiplier === 0) continue;
          const minPct = calc.firstHit.minPercent;
          const maxPct = calc.firstHit.maxPercent;
          const attempt: ProtectedAttempt = {
            poke: myPoke.name,
            move,
            moveType: moveTypeOfJa(move),
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
          const mt = moveTypeOfJa(m.name);
          if (!mt) return false;
          const en = moveNameResolver.toEnglish(m.name) ?? m.name;
          const md = movesById.get(toDataId(en));
          return !!md && md.basePower > 0;
        })
        .slice(0, 2);
      const opponentThreats: OpponentThreat[] = [];
      for (const oppMove of oppMoves) {
        for (const myPoke of team) {
          let calc;
          try {
            calc = calcOnceWithProtection(defenderConfig, myPoke, oppMove.name);
          } catch {
            continue;
          }
          const moveType = moveTypeOfJa(oppMove.name);
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
            typeMultLabel: TYPE_LABEL(calc.firstHit.typeMultiplier),
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
