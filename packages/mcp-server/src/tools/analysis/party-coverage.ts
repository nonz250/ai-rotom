import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import {
  calculateTypeEffectiveness,
  pokemonSchema,
  type PokemonInput,
} from "@ai-rotom/shared";
import {
  championsLearnsets,
  championsTypes,
  movesById,
  pokemonById,
  toDataId,
  type MoveCategory,
  type MoveEntry,
  type PokemonEntry,
  type TypeEntry,
} from "../../data-store.js";
import { pokemonNameResolver } from "../../name-resolvers.js";

const CHAMPIONS_GEN_NUM = 0;

/**
 * 抜群ラインのしきい値。
 * この値「ちょうど」までは uncovered 扱い、「これを超える」と covered 扱い。
 * 具体的には maxMultiplier <= 1 なら uncovered（等倍以下）、maxMultiplier > 1 なら covered（2倍以上）。
 */
export const EFFECTIVE_THRESHOLD = 1;

/** ステータス技（攻撃タイプから除外するため） */
const STATUS_CATEGORY: MoveCategory = "Status";

const TOOL_NAME = "analyze_party_coverage";
const TOOL_DESCRIPTION =
  "パーティの攻撃カバレッジを分析する。各防御タイプ（18種）に対して、パーティのどの技が最も効果的かを算出し、抜群を取れないタイプを洗い出す。"
  + " `uncoveredTypes` は『抜群（>1 倍）を取れる技が 1 つも無い防御タイプ』を列挙する（等倍 1 倍も含む）。抜群倍率の内訳は `coverage[].maxMultiplier` を参照。"
  + " 2タイプ複合のディフェンダーは analyze_matchup で個別に確認してください。ポケモンチャンピオンズ対応。";

const inputSchema = {
  myParty: z.array(pokemonSchema).describe("自分のパーティ（moves 未指定時は learnset 内の全攻撃技を候補にする）"),
  moves: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe(
      "ポケモン名（日本語 or 英語）をキーに技名配列を値とする map。"
      + "省略時は learnset から全攻撃技を候補にする。",
    ),
};

interface AttackingTypeEntry {
  type: string;
  nameJa: string;
}

interface BestAttackerEntry {
  pokemon: string;
  move: string;
  multiplier: number;
}

interface CoverageEntry {
  defenderType: string;
  defenderTypeJa: string;
  /**
   * パーティ内の全攻撃技がこの防御タイプに与える最大倍率。
   * 0 (無効) / 0.25 / 0.5 / 1 (等倍) / 2 / 4 のいずれか。
   */
  maxMultiplier: number;
  bestAttackers: BestAttackerEntry[];
}

export interface PartyCoverageOutput {
  attackingTypes: AttackingTypeEntry[];
  coverage: CoverageEntry[];
  /**
   * パーティ内の誰も抜群（>1 倍）を取れない防御タイプ一覧。
   * `coverage[].maxMultiplier <= 1` (無効・半減・等倍) となるタイプが該当する。
   */
  uncoveredTypes: AttackingTypeEntry[];
}

/**
 * 1 メンバー分の「覚えている攻撃技 ID」を取得する。
 * moves 指定があればそれを使い、未指定時は learnset から category !== Status の技を全て拾う。
 */
function resolveAttackingMoveIds(
  pokemonEntry: PokemonEntry,
  explicitMoves: string[] | undefined,
): MoveEntry[] {
  if (explicitMoves !== undefined) {
    const result: MoveEntry[] = [];
    for (const moveName of explicitMoves) {
      const moveId = toDataId(moveName);
      const move = movesById.get(moveId);
      if (move !== undefined && move.category !== STATUS_CATEGORY) {
        result.push(move);
      }
    }
    return result;
  }

  // learnset から全攻撃技を候補に
  const learnset = championsLearnsets[pokemonEntry.id];
  if (learnset === undefined) {
    return [];
  }

  const moves: MoveEntry[] = [];
  for (const moveId of learnset) {
    const move = movesById.get(moveId);
    if (move !== undefined && move.category !== STATUS_CATEGORY) {
      moves.push(move);
    }
  }
  return moves;
}

/**
 * ポケモン名を pokemon.json のエントリに解決する。
 */
function resolvePokemonEntry(name: string): PokemonEntry {
  const englishName =
    pokemonNameResolver.toEnglish(name) ??
    (pokemonNameResolver.hasEnglishName(name) ? name : null);

  if (englishName === null) {
    const suggestions = pokemonNameResolver.suggestSimilar(name);
    const suggestionMessage =
      suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
    throw new Error(
      `ポケモン「${name}」が見つかりません。${suggestionMessage}`,
    );
  }

  const entry = pokemonById.get(toDataId(englishName));
  if (entry === undefined) {
    throw new Error(`ポケモン「${name}」のデータが見つかりません。`);
  }
  return entry;
}

/**
 * moves マップのキー（日本語 or 英語ポケモン名）を英語 ID に正規化する。
 */
function normalizeMovesMap(
  moves: Record<string, string[]> | undefined,
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (moves === undefined) {
    return result;
  }
  for (const [pokemonName, moveList] of Object.entries(moves)) {
    const entry = resolvePokemonEntry(pokemonName);
    result.set(entry.id, moveList);
  }
  return result;
}

/**
 * 攻撃タイプ → 単一防御タイプへの倍率を計算する。
 */
function getEffectivenessForDefenderType(
  attackTypeName: string,
  defenderTypeName: string,
  gen: ReturnType<typeof Generations.get>,
): number {
  return calculateTypeEffectiveness(gen, attackTypeName as TypeName, [
    defenderTypeName as TypeName,
  ]);
}

export interface AnalyzePartyCoverageInput {
  myParty: PokemonInput[];
  moves?: Record<string, string[]>;
}

/**
 * パーティの攻撃カバレッジを計算する純関数。
 * MCP tool handler からも直接テストからも呼び出せる。
 */
export function analyzePartyCoverage(
  args: AnalyzePartyCoverageInput,
): PartyCoverageOutput {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);
  const movesMap = normalizeMovesMap(args.moves);

  interface MemberWithMoves {
    entry: PokemonEntry;
    attackingMoves: MoveEntry[];
  }

  const members: MemberWithMoves[] = [];
  const attackingTypesSet = new Set<string>();

  for (const member of args.myParty) {
    const entry = resolvePokemonEntry(member.name);
    const explicitMoves = movesMap.get(entry.id);
    const attackingMoves = resolveAttackingMoveIds(entry, explicitMoves);

    for (const move of attackingMoves) {
      attackingTypesSet.add(move.type);
    }

    members.push({ entry, attackingMoves });
  }

  const attackingTypes: AttackingTypeEntry[] = [];
  const typeJaMap = new Map<string, string>(
    championsTypes.map((t: TypeEntry) => [t.name, t.nameJa]),
  );
  for (const typeName of attackingTypesSet) {
    attackingTypes.push({
      type: typeName,
      nameJa: typeJaMap.get(typeName) ?? typeName,
    });
  }
  attackingTypes.sort((a, b) => a.type.localeCompare(b.type));

  const coverage: CoverageEntry[] = [];
  const uncoveredTypes: AttackingTypeEntry[] = [];

  for (const defenderType of championsTypes) {
    let maxMultiplier = 0;
    const bestAttackers: BestAttackerEntry[] = [];

    for (const member of members) {
      for (const move of member.attackingMoves) {
        const multiplier = getEffectivenessForDefenderType(
          move.type,
          defenderType.name,
          gen,
        );
        if (multiplier > maxMultiplier) {
          maxMultiplier = multiplier;
          bestAttackers.length = 0;
          bestAttackers.push({
            pokemon: member.entry.name,
            move: move.name,
            multiplier,
          });
        } else if (multiplier === maxMultiplier && multiplier > 0) {
          const alreadyHasSamePokemon = bestAttackers.some(
            (ba) => ba.pokemon === member.entry.name,
          );
          if (!alreadyHasSamePokemon) {
            bestAttackers.push({
              pokemon: member.entry.name,
              move: move.name,
              multiplier,
            });
          }
        }
      }
    }

    coverage.push({
      defenderType: defenderType.name,
      defenderTypeJa: defenderType.nameJa,
      maxMultiplier,
      bestAttackers,
    });

    if (maxMultiplier <= EFFECTIVE_THRESHOLD) {
      uncoveredTypes.push({
        type: defenderType.name,
        nameJa: defenderType.nameJa,
      });
    }
  }

  return {
    attackingTypes,
    coverage,
    uncoveredTypes,
  };
}

export function registerPartyCoverageTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const output = analyzePartyCoverage(args);

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
