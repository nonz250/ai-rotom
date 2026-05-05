import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import {
  DamageCalculatorAdapter,
  calculateTypeEffectiveness,
  compareSpeed,
  extractPriorityMoves,
  filterResultsByLearnset,
  pokemonSchema,
  type BaseStats,
  type ConditionsInput,
  type DamageCalcResult,
  type PriorityMoveInfo,
  type SpeedComparison,
} from "@ai-rotom/shared";
import {
  championsLearnsets,
  getLearnsetMoveIdSet,
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
import { TOOL_RESPONSE_HINT_CONTENT } from "../../tool-response-hint.js";

const CHAMPIONS_GEN_NUM = 0;

const TOOL_NAME = "analyze_selection";
const TOOL_DESCRIPTION =
  "6v6 パーティ間の全対面（最大 36 エントリ）について、タイプ相性・素早さ比較・最大ダメージ見積もりをマトリクスで返す。選出判断は本ツールが返すデータを元に AI が総合的に行う前提で、ツール側では推奨やスコアリングは行わない。ポケモンチャンピオンズ対応。正確な計算のため各ポケモンの ability / item の指定を推奨（省略時は通常特性・持ち物なし扱い）。";

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
  /**
   * 覚える先制技の一覧（priority 降順、同 priority は英名昇順）。
   * 技単位の静的 priority のみ。特性による補正（いたずらごころ等）は含まない。
   */
  priorityMoves: PriorityMoveInfo[];
}

interface DamageEstimateMove {
  /** 技の英語名（@smogon/calc に渡した正規化後の名前） */
  name: string;
  /** 技の日本語名。未登録技は英名をフォールバックとして返す。 */
  nameJa: string;
}

interface DamageEstimate {
  min: number;
  max: number;
  ohkoChance: string;
  /**
   * 採用された技（計算対象のうち最大ダメージを叩き出した 1 件）。
   */
  move: DamageEstimateMove;
  /**
   * 採用技タイプの、防御側複合タイプに対する相性倍率 (0/0.25/0.5/1/2/4)。
   * `MatchupEntry.typeAdvantage`（ポケモン種族タイプ基準のサマリ）と異なり、
   * 実際に採用された best 技タイプに対する精密な倍率。
   */
  typeMultiplier: number;
  /** 採用技タイプと攻撃側種族タイプの一致フラグ（通常 STAB のみ）。 */
  isStab: boolean;
  /**
   * STAB × typeMultiplier の概算値。
   * 通常 STAB (1.5) 前提で、てきおうりょく・天候・状態異常等は含まない。
   */
  effectivePowerMultiplier: number;
}

interface MatchupEntry {
  mine: string;
  opponent: string;
  typeAdvantage: { myToOpp: number; oppToMy: number };
  speedCompare: SpeedComparison;
  damageEstimate: DamageEstimate | null;
}

export interface SelectionAnalysisOutput {
  myParty: PokemonProfile[];
  opponentParty: PokemonProfile[];
  matchupMatrix: MatchupEntry[];
  battleFormat: "singles" | "doubles";
}

type PokemonInput = z.infer<typeof pokemonSchema>;

/**
 * 2つのポケモンタイプ配列から、攻撃側→防御側の最大抜群倍率を算出する。
 * 攻撃側は自身のタイプの技が出せる前提で、各タイプでの相性倍率のうち最大値を返す。
 */
function maxTypeMultiplier(
  attackerTypes: readonly string[],
  defenderTypes: readonly string[],
  gen: ReturnType<typeof Generations.get>,
): number {
  let max = 0;
  const defenders = defenderTypes as readonly TypeName[];
  for (const attackTypeName of attackerTypes) {
    const multiplier = calculateTypeEffectiveness(
      gen,
      attackTypeName as TypeName,
      defenders,
    );
    if (multiplier > max) {
      max = multiplier;
    }
  }
  return max;
}

/**
 * 最も有効な技（max ダメージ）から DamageEstimate を組み立てる。
 * results は max ダメージの降順でソート済みであることを前提とする。
 * 日本語名が未登録の場合は英名をそのまま nameJa に入れるフォールバック挙動。
 */
export function bestDamageEstimate(
  results: DamageCalcResult[],
  moveJaResolver: (enName: string) => string | undefined,
): DamageEstimate | null {
  if (results.length === 0) {
    return null;
  }
  const best = results[0];
  const nameJa = moveJaResolver(best.move) ?? best.move;
  return {
    min: best.minPercent,
    max: best.maxPercent,
    ohkoChance: best.koChance,
    move: { name: best.move, nameJa },
    typeMultiplier: best.typeMultiplier,
    isStab: best.isStab,
    effectivePowerMultiplier: best.effectivePowerMultiplier,
  };
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
 * movesMap 未指定経路では attacker の learnset でフィルタし、覚えない技での過大評価を避ける。
 * 明示指定経路は learnset フィルタを掛けない（ユーザーの明示選択を尊重する既存仕様を維持）。
 * conditions (battleFormat 等) を calculator に伝える。
 */
export function calculateDamageForMatchup(
  calculator: DamageCalculatorAdapter,
  attacker: PokemonInput,
  defender: PokemonInput,
  attackerId: string,
  attackerLearnsetIds: ReadonlySet<string>,
  movesMap: Map<string, string[]>,
  conditions?: ConditionsInput,
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
            conditions,
          }),
        );
      } catch {
        // 存在しない技名などはスキップ
      }
    }
    results.sort((a, b) => b.max - a.max);
    return results;
  }
  const allResults = calculator.calculateAllMoves({ attacker, defender, conditions });
  return filterResultsByLearnset(allResults, attackerLearnsetIds, toDataId);
}

export function registerSelectionAnalysisTool(server: McpServer): void {
  const calculator = new DamageCalculatorAdapter(
    {
      pokemon: pokemonNameResolver,
      move: moveNameResolver,
      ability: abilityNameResolver,
      item: itemNameResolver,
      nature: natureNameResolver,
    },
    pokemonEntryProvider,
  );

  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const gen = Generations.get(CHAMPIONS_GEN_NUM);
      const movesMap = resolveMovesMap(args.moves);

      // battleFormat (トップレベル) を conditions に詰め直してダメ計に伝える。
      // これがないと @smogon/calc 側でダブル補正 (AoE 技 ×0.75 等) が効かない。
      const damageConditions: ConditionsInput = {
        battleFormat: args.battleFormat,
      };

      // プロフィール作成
      interface PartyMemberContext {
        input: PokemonInput;
        profile: PokemonProfile;
        entryId: string;
      }

      function buildMemberContext(input: PokemonInput): PartyMemberContext {
        const { pokemon, resolvedName } =
          calculator.createPokemonObject(input);
        const entryId = toDataId(resolvedName);
        const entry = pokemonById.get(entryId);
        const nameJa =
          pokemonNameResolver.toJapanese(resolvedName) ?? resolvedName;

        const types =
          entry !== undefined
            ? [...entry.types]
            : [...(pokemon.types as readonly string[])];

        const priorityMoves = extractPriorityMoves({
          learnsetMoveIds: championsLearnsets[entryId] ?? [],
          resolveMove: (id) => movesById.get(id),
          toJapanese: (enName) => moveNameResolver.toJapanese(enName),
        });

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
          priorityMoves,
        };

        return {
          input,
          profile,
          entryId,
        };
      }

      const myMembers = args.myParty.map(buildMemberContext);
      const oppMembers = args.opponentParty.map(buildMemberContext);

      // 各自軍ポケモンの learnset ID セットは対面ごとに変わらないため、外側ループで 1 回だけ引く
      const myLearnsetIds = new Map<string, ReadonlySet<string>>();
      for (const mine of myMembers) {
        myLearnsetIds.set(mine.entryId, getLearnsetMoveIdSet(mine.entryId));
      }

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

          const speedCompare = compareSpeed(
            mine.profile.actualStats.spe,
            opp.profile.actualStats.spe,
          );

          let damageEstimate: DamageEstimate | null = null;
          try {
            const results = calculateDamageForMatchup(
              calculator,
              mine.input,
              opp.input,
              mine.entryId,
              myLearnsetIds.get(mine.entryId) ?? new Set(),
              movesMap,
              damageConditions,
            );
            damageEstimate = bestDamageEstimate(
              results,
              (enName) => moveNameResolver.toJapanese(enName),
            );
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

      const output: SelectionAnalysisOutput = {
        myParty: myMembers.map((m) => m.profile),
        opponentParty: oppMembers.map((m) => m.profile),
        matchupMatrix: matrix,
        battleFormat: args.battleFormat,
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(output) },
          TOOL_RESPONSE_HINT_CONTENT,
        ],
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
