import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import {
  applyOffensiveTypeOverride,
  calculateTypeEffectiveness,
  pokemonSchema,
  type PokemonInput,
} from "@ai-rotom/shared";
import {
  championsLearnsets,
  championsPokemon,
  championsTypes,
  movesById,
  pokemonById,
  toDataId,
  type MoveCategory,
  type MoveEntry,
  type PokemonEntry,
  type TypeEntry,
} from "../../data-store.js";
import {
  abilityNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";
import { TOOL_RESPONSE_HINT_CONTENT } from "../../tool-response-hint.js";

const CHAMPIONS_GEN_NUM = 0;

/** 複合タイプを構成するタイプ数 */
const DUAL_TYPE_COUNT = 2;

/** 複合タイプ集合キーのセパレータ（タイプ名に現れない文字） */
const DUAL_TYPE_KEY_SEPARATOR = "/";

/** `dualTypeCoverage` の `examplePokemon` に収める最大件数 */
const MAX_EXAMPLE_POKEMON = 3;

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
  + " 実在する複合タイプ（データ内に 1 匹以上存在する 2 タイプ組合せ）に対するカバレッジは `dualTypeCoverage` を参照。抜群を取れない複合タイプ数は `dualTypeUncoveredCount`。"
  + " 攻撃側のタイプ変換系特性（Pixilate 等）は単一/複合カバレッジ双方に反映される。"
  + " ポケモンチャンピオンズ対応。";

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
  /**
   * 特性によってタイプ変換された場合の実効タイプ。
   * 元タイプと同じ場合は省略する（例: Pixilate + Hyper Beam → "Fairy"）。
   */
  effectiveType?: string;
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

/**
 * 実在する複合タイプ（データ内に 1 匹以上存在する 2 タイプ組合せ）に対する
 * パーティのカバレッジエントリ。
 */
interface DualTypeCoverageEntry {
  /** 防御側の複合タイプ（英名、英名辞書順でソート済み） */
  defenderTypes: [string, string];
  /** 防御側の複合タイプ（日本語名、`defenderTypes` と同じ順序） */
  defenderTypesJa: [string, string];
  /**
   * パーティ内の全攻撃技がこの複合タイプに与える最大倍率。
   * 0 (無効) / 0.25 / 0.5 / 1 (等倍) / 2 / 4 のいずれか。
   */
  maxMultiplier: number;
  bestAttackers: BestAttackerEntry[];
  /**
   * この複合タイプを持つ代表的なポケモン名（日本語名優先、上位 `MAX_EXAMPLE_POKEMON` 件）。
   * AI が「このタイプ組合せ = あのポケモン」と結び付けるための補助情報。
   */
  examplePokemon: string[];
}

export interface PartyCoverageOutput {
  attackingTypes: AttackingTypeEntry[];
  coverage: CoverageEntry[];
  /**
   * パーティ内の誰も抜群（>1 倍）を取れない防御タイプ一覧。
   * `coverage[].maxMultiplier <= 1` (無効・半減・等倍) となるタイプが該当する。
   */
  uncoveredTypes: AttackingTypeEntry[];
  /**
   * 実在する複合タイプに対するカバレッジ。
   * `maxMultiplier` 昇順（抜群を取れないものが先頭）で安定ソート済み。
   */
  dualTypeCoverage: DualTypeCoverageEntry[];
  /**
   * 抜群を取れない複合タイプ数。
   * `dualTypeCoverage[].maxMultiplier <= EFFECTIVE_THRESHOLD` の件数と一致する。
   */
  dualTypeUncoveredCount: number;
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
 * 日本語・英語のどちらの名前でも英語名に解決する。
 * 未知の名前は undefined を返し、呼び出し側で silent ignore する。
 *
 * 未知の特性文字列でエラーにしないのは、party_coverage が
 * 「構築入力を緩く受け取る」UX を取っているため。
 * 未知の特性は単に override なし扱いとする。
 */
function resolveOptionalName(
  resolver: typeof abilityNameResolver,
  name: string | undefined,
): string | undefined {
  if (name === undefined) return undefined;
  const english = resolver.toEnglish(name);
  if (english !== undefined) return english;
  if (resolver.hasEnglishName(name)) return name;
  return undefined;
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

/**
 * 攻撃タイプ → 複合防御タイプへの倍率を計算する。
 */
function getEffectivenessForDualTypes(
  attackTypeName: string,
  defenderTypes: readonly [string, string],
  gen: ReturnType<typeof Generations.get>,
): number {
  return calculateTypeEffectiveness(
    gen,
    attackTypeName as TypeName,
    defenderTypes as readonly TypeName[],
  );
}

/**
 * 実在する複合タイプ（データ内に 1 匹以上存在するタイプ組合せ）の集合を構築する。
 * 対称性解消のため、キーは英名辞書順の 2 タイプを `/` で連結した文字列とする。
 *
 * `examplePokemon` 用の代表ポケモンも同時に収集する:
 * - メガ進化・リージョンフォーム等の派生フォーム（`baseSpecies !== null`）は後置し、
 *   ベース種族を優先表示する（同じ実体の重複を避けるため）
 * - 同一優先度内では英名の辞書順で安定化
 * - 先頭 `MAX_EXAMPLE_POKEMON` 件を採用
 */
function buildRealDualTypeMap(
  pokemon: readonly PokemonEntry[],
): Map<string, { types: [string, string]; examplePokemon: string[] }> {
  const accumulator = new Map<string, { types: [string, string]; entries: PokemonEntry[] }>();

  for (const entry of pokemon) {
    if (entry.types.length !== DUAL_TYPE_COUNT) {
      continue;
    }
    const sortedTypes = [...entry.types].sort((a, b) => a.localeCompare(b)) as [string, string];
    const key = `${sortedTypes[0]}${DUAL_TYPE_KEY_SEPARATOR}${sortedTypes[1]}`;

    const existing = accumulator.get(key);
    if (existing === undefined) {
      accumulator.set(key, { types: sortedTypes, entries: [entry] });
    } else {
      existing.entries.push(entry);
    }
  }

  const result = new Map<string, { types: [string, string]; examplePokemon: string[] }>();
  for (const [key, { types, entries }] of accumulator) {
    const sorted = [...entries].sort((a, b) => {
      const aIsForme = a.baseSpecies !== null ? 1 : 0;
      const bIsForme = b.baseSpecies !== null ? 1 : 0;
      if (aIsForme !== bIsForme) {
        return aIsForme - bIsForme;
      }
      return a.name.localeCompare(b.name);
    });
    const examplePokemon = sorted
      .slice(0, MAX_EXAMPLE_POKEMON)
      .map((entry) => pokemonNameResolver.toJapanese(entry.name) ?? entry.name);
    result.set(key, { types, examplePokemon });
  }
  return result;
}

export interface AnalyzePartyCoverageInput {
  myParty: PokemonInput[];
  moves?: Record<string, string[]>;
}

/**
 * 攻撃技の effectiveType を前計算済みのパーティメンバー。
 *
 * 単一タイプ coverage と dualTypeCoverage の両ループが同じ effectiveType
 * を参照できるよう、`attackingTypesSet` 構築時に一度だけ算出しておく。
 * `ability` は effectiveType に吸収されるためここでは保持しない。
 */
interface PrecomputedMember {
  entry: PokemonEntry;
  attackingMoves: Array<{ move: MoveEntry; effectiveType: TypeName }>;
}

/**
 * 候補の attacker で `bestAttackers` を更新する共通ロジック。
 *
 * - `candidate.multiplier > currentMax` の場合は bestAttackers をクリアして入れ替え、新しい max を返す
 * - タイの場合は同一ポケモンが未登録であれば追加する（multiplier > 0 のときのみ、0 倍無効は列挙しない）
 * - それ以外は現状維持
 *
 * bestAttackers は in-place で更新する。maxMultiplier は戻り値として返す。
 */
function updateBestAttackers(
  currentMax: number,
  bestAttackers: BestAttackerEntry[],
  candidate: BestAttackerEntry,
): number {
  if (candidate.multiplier > currentMax) {
    bestAttackers.length = 0;
    bestAttackers.push(candidate);
    return candidate.multiplier;
  }
  if (candidate.multiplier === currentMax && candidate.multiplier > 0) {
    const alreadyHasSamePokemon = bestAttackers.some(
      (ba) => ba.pokemon === candidate.pokemon,
    );
    if (!alreadyHasSamePokemon) {
      bestAttackers.push(candidate);
    }
  }
  return currentMax;
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

  const members: PrecomputedMember[] = [];
  const attackingTypesSet = new Set<string>();

  for (const member of args.myParty) {
    const entry = resolvePokemonEntry(member.name);
    const explicitMoves = movesMap.get(entry.id);
    const rawAttackingMoves = resolveAttackingMoveIds(entry, explicitMoves);
    const ability = resolveOptionalName(abilityNameResolver, member.ability);

    const attackingMoves: Array<{ move: MoveEntry; effectiveType: TypeName }> = [];
    for (const move of rawAttackingMoves) {
      const effectiveType = applyOffensiveTypeOverride(
        move.type as TypeName,
        move.category,
        ability,
      );
      attackingTypesSet.add(effectiveType);
      attackingMoves.push({ move, effectiveType });
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
      for (const { move, effectiveType } of member.attackingMoves) {
        const multiplier = getEffectivenessForDefenderType(
          effectiveType,
          defenderType.name,
          gen,
        );
        const attacker: BestAttackerEntry = {
          pokemon: member.entry.name,
          move: move.name,
          multiplier,
        };
        if (effectiveType !== move.type) {
          attacker.effectiveType = effectiveType;
        }
        maxMultiplier = updateBestAttackers(maxMultiplier, bestAttackers, attacker);
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

  const dualTypeMap = buildRealDualTypeMap(championsPokemon);
  const dualTypeCoverage: DualTypeCoverageEntry[] = [];
  let dualTypeUncoveredCount = 0;

  for (const { types, examplePokemon } of dualTypeMap.values()) {
    let maxMultiplier = 0;
    const bestAttackers: BestAttackerEntry[] = [];

    for (const member of members) {
      for (const { move, effectiveType } of member.attackingMoves) {
        const multiplier = getEffectivenessForDualTypes(effectiveType, types, gen);
        const attacker: BestAttackerEntry = {
          pokemon: member.entry.name,
          move: move.name,
          multiplier,
        };
        if (effectiveType !== move.type) {
          attacker.effectiveType = effectiveType;
        }
        maxMultiplier = updateBestAttackers(maxMultiplier, bestAttackers, attacker);
      }
    }

    dualTypeCoverage.push({
      defenderTypes: types,
      defenderTypesJa: [
        typeJaMap.get(types[0]) ?? types[0],
        typeJaMap.get(types[1]) ?? types[1],
      ],
      maxMultiplier,
      bestAttackers,
      examplePokemon,
    });

    if (maxMultiplier <= EFFECTIVE_THRESHOLD) {
      dualTypeUncoveredCount += 1;
    }
  }

  dualTypeCoverage.sort((a, b) => {
    if (a.maxMultiplier !== b.maxMultiplier) {
      return a.maxMultiplier - b.maxMultiplier;
    }
    if (a.defenderTypes[0] !== b.defenderTypes[0]) {
      return a.defenderTypes[0].localeCompare(b.defenderTypes[0]);
    }
    return a.defenderTypes[1].localeCompare(b.defenderTypes[1]);
  });

  return {
    attackingTypes,
    coverage,
    uncoveredTypes,
    dualTypeCoverage,
    dualTypeUncoveredCount,
  };
}

export function registerPartyCoverageTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const output = analyzePartyCoverage(args);

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
