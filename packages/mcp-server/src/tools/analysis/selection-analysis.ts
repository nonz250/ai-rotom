import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations, toID } from "@smogon/calc";
import { DamageCalculatorAdapter } from "../../calc/damage-calculator.js";
import type { DamageCalcResult } from "../../calc/damage-calculator.js";
import {
  pokemonById,
  toDataId,
  type BaseStats,
} from "../../data-store.js";
import {
  abilityNameResolver,
  itemNameResolver,
  moveNameResolver,
  natureNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";
import { pokemonSchema } from "../schemas/pokemon-input.js";

const CHAMPIONS_GEN_NUM = 0;

/** 選出推奨のトップ N 件 */
const RECOMMENDATION_TOP_N = 3;

/** 各スコアの重み */
const SCORE_WEIGHT_SPEED_WIN = 2;
const SCORE_WEIGHT_TYPE_ADVANTAGE = 3;
const SCORE_WEIGHT_DAMAGE_ADVANTAGE = 5;
const SCORE_WEIGHT_TYPE_DISADVANTAGE = -1;

/** ダメージ閾値（%表記） */
const OHKO_PERCENT_THRESHOLD = 100;
const TWO_HKO_PERCENT_THRESHOLD = 50;

/** タイプ抜群判定のしきい値 */
const SUPER_EFFECTIVE_THRESHOLD = 2;

const TOOL_NAME = "analyze_selection";
const TOOL_DESCRIPTION =
  "選出判断の一括分析を行う。自分と相手のパーティから全組み合わせ（最大 6x6）のマトリクスを生成し、タイプ相性・素早さ・ダメージ見積もりと先発/起点交代候補の推奨を返す。ポケモンチャンピオンズ対応。";

const battleFormatValues = ["singles", "doubles"] as const;

const inputSchema = {
  myParty: z.array(pokemonSchema).describe("自分のパーティ"),
  opponentParty: z.array(pokemonSchema).describe("相手のパーティ"),
  battleFormat: z
    .enum(battleFormatValues)
    .describe("対戦形式（シングル: singles / ダブル: doubles）"),
  moves: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe(
      "ポケモン名（日本語 or 英語）ごとに候補技を指定する。省略時は全攻撃技で計算。",
    ),
};

interface PokemonProfile {
  name: string;
  nameJa: string;
  types: string[];
  actualStats: BaseStats;
}

interface DamageEstimate {
  min: number;
  max: number;
  ohkoChance: string;
}

interface MatchupEntry {
  mine: string;
  opponent: string;
  typeAdvantage: { myToOpp: number; oppToMy: number };
  speedCompare: "faster" | "slower" | "tie";
  damageEstimate: DamageEstimate | null;
}

interface SelectionRecommendations {
  lead: string[];
  pivot: string[];
}

export interface SelectionAnalysisOutput {
  myParty: PokemonProfile[];
  opponentParty: PokemonProfile[];
  matchupMatrix: MatchupEntry[];
  recommendations: SelectionRecommendations;
  battleFormat: "singles" | "doubles";
}

type PokemonInput = z.infer<typeof pokemonSchema>;

/**
 * 2つのポケモンタイプ配列から、攻撃側→防御側の最大抜群倍率を算出する。
 */
function maxTypeMultiplier(
  attackerTypes: readonly string[],
  defenderTypes: readonly string[],
  gen: ReturnType<typeof Generations.get>,
): number {
  let max = 0;
  for (const attackTypeName of attackerTypes) {
    const attackType = gen.types.get(toID(attackTypeName));
    if (attackType === undefined) continue;
    const eff = attackType.effectiveness as Record<string, number>;
    let multiplier = 1;
    for (const defenseType of defenderTypes) {
      const val = eff[defenseType];
      if (val !== undefined) {
        multiplier *= val;
      }
    }
    if (multiplier > max) {
      max = multiplier;
    }
  }
  return max;
}

/**
 * 最も有効な技（max ダメージ）から DamageEstimate を組み立てる。
 */
function bestDamageEstimate(
  results: DamageCalcResult[],
): DamageEstimate | null {
  if (results.length === 0) {
    return null;
  }
  const best = results[0];
  return {
    min: best.minPercent,
    max: best.maxPercent,
    ohkoChance: best.koChance,
  };
}

/**
 * ポケモンの対面スコア（選出推奨用）を計算する。
 * 大きいほど対面に強い。
 */
function calcMatchupScore(entry: MatchupEntry): number {
  let score = 0;

  // 素早さ
  if (entry.speedCompare === "faster") {
    score += SCORE_WEIGHT_SPEED_WIN;
  } else if (entry.speedCompare === "slower") {
    score -= SCORE_WEIGHT_SPEED_WIN;
  }

  // タイプ相性
  if (entry.typeAdvantage.myToOpp >= SUPER_EFFECTIVE_THRESHOLD) {
    score += SCORE_WEIGHT_TYPE_ADVANTAGE;
  }
  if (entry.typeAdvantage.oppToMy >= SUPER_EFFECTIVE_THRESHOLD) {
    score += SCORE_WEIGHT_TYPE_DISADVANTAGE;
  }

  // ダメージ優位
  if (entry.damageEstimate !== null) {
    if (entry.damageEstimate.max >= OHKO_PERCENT_THRESHOLD) {
      score += SCORE_WEIGHT_DAMAGE_ADVANTAGE;
    } else if (entry.damageEstimate.max >= TWO_HKO_PERCENT_THRESHOLD) {
      score += SCORE_WEIGHT_DAMAGE_ADVANTAGE / 2;
    }
  }

  return score;
}

/**
 * あるポケモンの「合計スコア」を、相手パーティ全員に対するスコア和として算出する。
 */
function calcTotalScoreForAttacker(
  attackerName: string,
  matrix: MatchupEntry[],
): number {
  let total = 0;
  for (const entry of matrix) {
    if (entry.mine === attackerName) {
      total += calcMatchupScore(entry);
    }
  }
  return total;
}

/**
 * 上位 N 件のポケモン名（日本語名）を返す。
 */
function topPokemonByScore(
  myParty: readonly PokemonProfile[],
  scorer: (name: string) => number,
  topN: number,
): string[] {
  const scored = myParty.map((p) => ({
    nameJa: p.nameJa,
    score: scorer(p.name),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s) => s.nameJa);
}

/**
 * ポケモンごとの候補技を英名リストに正規化する（日本語 → 英語）。
 */
function resolveMovesMap(
  moves: Record<string, string[]> | undefined,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (moves === undefined) return result;
  for (const [pokemonName, moveList] of Object.entries(moves)) {
    const englishName =
      pokemonNameResolver.toEnglish(pokemonName) ??
      (pokemonNameResolver.hasEnglishName(pokemonName) ? pokemonName : null);
    if (englishName === null) continue;
    const id = toDataId(englishName);
    result.set(id, moveList);
  }
  return result;
}

/**
 * attacker vs defender の候補技でダメージを計算する。
 * movesMap に指定があればそれを、無ければ全技で計算する。
 */
function calculateDamageForMatchup(
  calculator: DamageCalculatorAdapter,
  attacker: PokemonInput,
  defender: PokemonInput,
  attackerId: string,
  movesMap: Map<string, string[]>,
): DamageCalcResult[] {
  const explicitMoves = movesMap.get(attackerId);
  if (explicitMoves !== undefined && explicitMoves.length > 0) {
    const results: DamageCalcResult[] = [];
    for (const moveName of explicitMoves) {
      try {
        results.push(
          calculator.calculate({
            attacker,
            defender,
            moveName,
          }),
        );
      } catch {
        // 存在しない技名などはスキップ
      }
    }
    results.sort((a, b) => b.max - a.max);
    return results;
  }
  return calculator.calculateAllMoves({ attacker, defender });
}

export function registerSelectionAnalysisTool(server: McpServer): void {
  const calculator = new DamageCalculatorAdapter({
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  });

  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const gen = Generations.get(CHAMPIONS_GEN_NUM);
      const movesMap = resolveMovesMap(args.moves);

      // プロフィール作成
      interface PartyMemberContext {
        input: PokemonInput;
        profile: PokemonProfile;
        entryId: string;
      }

      function buildMemberContext(input: PokemonInput): PartyMemberContext {
        const { pokemon, resolvedName } =
          calculator.createPokemonObject(input);
        const entry = pokemonById.get(toDataId(resolvedName));
        const nameJa =
          pokemonNameResolver.toJapanese(resolvedName) ?? resolvedName;

        const types =
          entry !== undefined
            ? [...entry.types]
            : [...(pokemon.types as readonly string[])];

        const profile: PokemonProfile = {
          name: resolvedName,
          nameJa,
          types,
          actualStats: {
            hp: pokemon.stats.hp,
            atk: pokemon.stats.atk,
            def: pokemon.stats.def,
            spa: pokemon.stats.spa,
            spd: pokemon.stats.spd,
            spe: pokemon.stats.spe,
          },
        };

        return {
          input,
          profile,
          entryId: toDataId(resolvedName),
        };
      }

      const myMembers = args.myParty.map(buildMemberContext);
      const oppMembers = args.opponentParty.map(buildMemberContext);

      // マトリクス作成
      const matrix: MatchupEntry[] = [];

      for (const mine of myMembers) {
        for (const opp of oppMembers) {
          const myToOpp = maxTypeMultiplier(
            mine.profile.types,
            opp.profile.types,
            gen,
          );
          const oppToMy = maxTypeMultiplier(
            opp.profile.types,
            mine.profile.types,
            gen,
          );

          const speedCompare: MatchupEntry["speedCompare"] =
            mine.profile.actualStats.spe > opp.profile.actualStats.spe
              ? "faster"
              : mine.profile.actualStats.spe < opp.profile.actualStats.spe
              ? "slower"
              : "tie";

          let damageEstimate: DamageEstimate | null = null;
          try {
            const results = calculateDamageForMatchup(
              calculator,
              mine.input,
              opp.input,
              mine.entryId,
              movesMap,
            );
            damageEstimate = bestDamageEstimate(results);
          } catch {
            damageEstimate = null;
          }

          matrix.push({
            mine: mine.profile.name,
            opponent: opp.profile.name,
            typeAdvantage: { myToOpp, oppToMy },
            speedCompare,
            damageEstimate,
          });
        }
      }

      // 推奨候補（lead / pivot）
      const leadScorer = (name: string): number =>
        calcTotalScoreForAttacker(name, matrix);

      const lead = topPokemonByScore(
        myMembers.map((m) => m.profile),
        leadScorer,
        RECOMMENDATION_TOP_N,
      );

      // pivot は「最速で倒しにくいが、交代駒として出しやすい」視点。
      // ここでは素早さ優位が少ないが、相手に抜群を取られにくい候補を pivot とする。
      const pivotScorer = (name: string): number => {
        let total = 0;
        for (const entry of matrix) {
          if (entry.mine !== name) continue;
          // タイプで受けきれる = oppToMy が 1 未満
          if (entry.typeAdvantage.oppToMy < 1) {
            total += 1;
          }
          if (entry.speedCompare === "slower") {
            total -= 0.5;
          }
        }
        return total;
      };

      const pivot = topPokemonByScore(
        myMembers.map((m) => m.profile),
        pivotScorer,
        RECOMMENDATION_TOP_N,
      );

      const output: SelectionAnalysisOutput = {
        myParty: myMembers.map((m) => m.profile),
        opponentParty: oppMembers.map((m) => m.profile),
        matchupMatrix: matrix,
        recommendations: { lead, pivot },
        battleFormat: args.battleFormat,
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
