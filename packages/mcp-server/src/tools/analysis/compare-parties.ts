import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations, Pokemon } from "@smogon/calc";
import {
  baseStatsTotal,
  collectPartyResistanceTypes,
  collectPartyWeaknessTypes,
  computeNumericStats,
  pokemonSchema,
  type NumericStats,
  type PokemonInput,
} from "@ai-rotom/shared";
import {
  championsTypes,
  pokemonById,
  toDataId,
  type PokemonEntry,
} from "../../data-store.js";
import {
  natureNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";
import { analyzePartyCoverage, EFFECTIVE_THRESHOLD } from "./party-coverage.js";

const CHAMPIONS_GEN_NUM = 0;

/** 対戦に組めるパーティメンバーの上限 (ポケモンチャンピオンズ仕様) */
const MAX_PARTY_SIZE = 6;

/** 性格未指定時の既定 (無補正性格) */
const DEFAULT_NATURE_EN = "Serious";

const TOOL_NAME = "compare_parties";
const TOOL_DESCRIPTION =
  "2 つのパーティ (A / B) の統計差分を比較する。メンバー差分・タイプ分布・弱点/耐性/カバレッジ集合・素早さ分布・種族値合計の構造化データを 1 コールで返す。"
  + " パーティ改修案の比較や入れ替え検討に使用する。優劣判定は行わず、差分データのみを返す (解釈は AI 側の責務)。"
  + " moves は指定できないため、カバレッジ差分は learnset 全攻撃技ベースで評価される。ポケモンチャンピオンズ対応。";

const labelsSchema = z
  .object({
    partyA: z.string().optional(),
    partyB: z.string().optional(),
  })
  .optional()
  .describe("表示用ラベル (例: { partyA: '現行', partyB: '改修案' })");

const inputSchema = {
  partyA: z
    .array(pokemonSchema)
    .min(1)
    .max(MAX_PARTY_SIZE)
    .describe("比較対象のパーティ A"),
  partyB: z
    .array(pokemonSchema)
    .min(1)
    .max(MAX_PARTY_SIZE)
    .describe("比較対象のパーティ B"),
  labels: labelsSchema,
};

interface MemberRef {
  /** 英語名 (ポケモンデータの正規名) */
  name: string;
  /** 日本語名。未登録の場合は英名フォールバック */
  nameJa: string;
  types: string[];
  baseStatsTotal: number;
}

interface PartySummary {
  label: string | null;
  members: MemberRef[];
  baseStatsTotal: number;
  speedStats: NumericStats;
}

interface TypeCountDiff {
  type: string;
  nameJa: string;
  countA: number;
  countB: number;
  /** B - A の差分 (正: B が多い / 負: A が多い) */
  diff: number;
}

interface SymmetricSetDiff {
  partyAOnly: string[];
  partyBOnly: string[];
  both: string[];
}

interface CoverageDiff extends SymmetricSetDiff {
  neither: string[];
}

interface MemberDifferences {
  partyAOnly: MemberRef[];
  partyBOnly: MemberRef[];
  shared: MemberRef[];
}

export interface PartyComparisonOutput {
  partyA: PartySummary;
  partyB: PartySummary;
  differences: {
    memberDifferences: MemberDifferences;
    typeDistribution: {
      changes: TypeCountDiff[];
    };
    weaknesses: SymmetricSetDiff;
    resistances: SymmetricSetDiff;
    coverage: CoverageDiff;
    speedDistribution: {
      partyA: NumericStats;
      partyB: NumericStats;
    };
    baseStatsTotal: {
      partyA: number;
      partyB: number;
      /** B - A の差分 (正: B の合計が大きい) */
      diff: number;
    };
  };
}

interface ResolvedMember {
  input: PokemonInput;
  entry: PokemonEntry;
  memberRef: MemberRef;
}

/**
 * ポケモン名を pokemon.json のエントリに解決する。
 * 未登録名は類似候補付きエラーを投げる。
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
 * 性格名を英語に解決する。省略時は無補正性格。
 */
function resolveNatureName(nature: string | undefined): string {
  if (nature === undefined) {
    return DEFAULT_NATURE_EN;
  }

  const englishName = natureNameResolver.toEnglish(nature);
  if (englishName !== undefined) {
    return englishName;
  }

  if (natureNameResolver.hasEnglishName(nature)) {
    return nature;
  }

  const suggestions = natureNameResolver.suggestSimilar(nature);
  const suggestionMessage =
    suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
  throw new Error(`性格「${nature}」が見つかりません。${suggestionMessage}`);
}

/**
 * pokemon.json のエントリから @smogon/calc 用 overrides を組み立てる。
 */
function buildSpeciesOverrides(
  entry: PokemonEntry,
): NonNullable<ConstructorParameters<typeof Pokemon>[2]>["overrides"] {
  return {
    types: entry.types,
    baseStats: entry.baseStats,
  } as NonNullable<ConstructorParameters<typeof Pokemon>[2]>["overrides"];
}

/**
 * 入力ポケモンの素早さ実数値を @smogon/calc で算出する。
 * ランク補正・状態異常は加味しない (build としての素早さ比較が目的のため)。
 */
function calculateMemberSpeed(
  input: PokemonInput,
  entry: PokemonEntry,
  gen: ReturnType<typeof Generations.get>,
): number {
  const natureEn = resolveNatureName(input.nature);
  const pokemon = new Pokemon(gen, entry.name, {
    nature: natureEn,
    evs: { spe: input.evs?.spe ?? 0 },
    overrides: buildSpeciesOverrides(entry),
  });
  return pokemon.stats.spe;
}

function toMemberRef(entry: PokemonEntry): MemberRef {
  return {
    name: entry.name,
    nameJa: entry.nameJa ?? entry.name,
    types: [...entry.types],
    baseStatsTotal: baseStatsTotal(entry.baseStats),
  };
}

function resolveMembers(party: readonly PokemonInput[]): ResolvedMember[] {
  return party.map((input) => {
    const entry = resolvePokemonEntry(input.name);
    return { input, entry, memberRef: toMemberRef(entry) };
  });
}

function partyBaseStatsTotal(members: readonly ResolvedMember[]): number {
  let total = 0;
  for (const m of members) {
    total += m.memberRef.baseStatsTotal;
  }
  return total;
}

function buildPartySummary(
  members: readonly ResolvedMember[],
  label: string | undefined,
  gen: ReturnType<typeof Generations.get>,
): PartySummary {
  const speeds = members.map((m) => calculateMemberSpeed(m.input, m.entry, gen));
  return {
    label: label ?? null,
    members: members.map((m) => m.memberRef),
    baseStatsTotal: partyBaseStatsTotal(members),
    speedStats: computeNumericStats(speeds),
  };
}

function computeMemberDifferences(
  membersA: readonly ResolvedMember[],
  membersB: readonly ResolvedMember[],
): MemberDifferences {
  const idsA = new Map<string, ResolvedMember>();
  for (const m of membersA) {
    idsA.set(m.entry.id, m);
  }
  const idsB = new Map<string, ResolvedMember>();
  for (const m of membersB) {
    idsB.set(m.entry.id, m);
  }

  const partyAOnly: MemberRef[] = [];
  const partyBOnly: MemberRef[] = [];
  const shared: MemberRef[] = [];

  for (const [id, member] of idsA) {
    if (idsB.has(id)) {
      shared.push(member.memberRef);
    } else {
      partyAOnly.push(member.memberRef);
    }
  }
  for (const [id, member] of idsB) {
    if (!idsA.has(id)) {
      partyBOnly.push(member.memberRef);
    }
  }

  return { partyAOnly, partyBOnly, shared };
}

function countTypes(members: readonly ResolvedMember[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of members) {
    for (const t of m.entry.types) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return counts;
}

function computeTypeDistributionChanges(
  membersA: readonly ResolvedMember[],
  membersB: readonly ResolvedMember[],
): TypeCountDiff[] {
  const countsA = countTypes(membersA);
  const countsB = countTypes(membersB);
  const changes: TypeCountDiff[] = [];
  for (const t of championsTypes) {
    const countA = countsA.get(t.name) ?? 0;
    const countB = countsB.get(t.name) ?? 0;
    changes.push({
      type: t.name,
      nameJa: t.nameJa,
      countA,
      countB,
      diff: countB - countA,
    });
  }
  return changes;
}

function diffTypeSets(setA: Set<string>, setB: Set<string>): SymmetricSetDiff {
  const partyAOnly: string[] = [];
  const partyBOnly: string[] = [];
  const both: string[] = [];
  for (const type of setA) {
    if (setB.has(type)) {
      both.push(type);
    } else {
      partyAOnly.push(type);
    }
  }
  for (const type of setB) {
    if (!setA.has(type)) {
      partyBOnly.push(type);
    }
  }
  partyAOnly.sort();
  partyBOnly.sort();
  both.sort();
  return { partyAOnly, partyBOnly, both };
}

/**
 * パーティが抜群 (> 1 倍) を取れる防御タイプ集合。
 */
function collectCoveredDefenderTypes(
  party: readonly PokemonInput[],
): Set<string> {
  const result = new Set<string>();
  const output = analyzePartyCoverage({ myParty: [...party] });
  for (const entry of output.coverage) {
    if (entry.maxMultiplier > EFFECTIVE_THRESHOLD) {
      result.add(entry.defenderType);
    }
  }
  return result;
}

function computeCoverageDiff(
  partyA: readonly PokemonInput[],
  partyB: readonly PokemonInput[],
): CoverageDiff {
  const coveredA = collectCoveredDefenderTypes(partyA);
  const coveredB = collectCoveredDefenderTypes(partyB);

  const symmetric = diffTypeSets(coveredA, coveredB);

  const neither: string[] = [];
  for (const t of championsTypes) {
    if (!coveredA.has(t.name) && !coveredB.has(t.name)) {
      neither.push(t.name);
    }
  }
  neither.sort();

  return { ...symmetric, neither };
}

/**
 * パーティ比較の純関数。MCP ツールハンドラとテストから共通で利用する。
 */
export function comparePartiesAnalysis(args: {
  partyA: PokemonInput[];
  partyB: PokemonInput[];
  labels?: { partyA?: string; partyB?: string };
}): PartyComparisonOutput {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  const membersA = resolveMembers(args.partyA);
  const membersB = resolveMembers(args.partyB);

  const partyASummary = buildPartySummary(membersA, args.labels?.partyA, gen);
  const partyBSummary = buildPartySummary(membersB, args.labels?.partyB, gen);

  const memberTypesA = membersA.map((m) => m.entry.types);
  const memberTypesB = membersB.map((m) => m.entry.types);

  const weaknessesA = collectPartyWeaknessTypes(memberTypesA, gen);
  const weaknessesB = collectPartyWeaknessTypes(memberTypesB, gen);

  const resistancesA = collectPartyResistanceTypes(memberTypesA, gen);
  const resistancesB = collectPartyResistanceTypes(memberTypesB, gen);

  return {
    partyA: partyASummary,
    partyB: partyBSummary,
    differences: {
      memberDifferences: computeMemberDifferences(membersA, membersB),
      typeDistribution: {
        changes: computeTypeDistributionChanges(membersA, membersB),
      },
      weaknesses: diffTypeSets(weaknessesA, weaknessesB),
      resistances: diffTypeSets(resistancesA, resistancesB),
      coverage: computeCoverageDiff(args.partyA, args.partyB),
      speedDistribution: {
        partyA: partyASummary.speedStats,
        partyB: partyBSummary.speedStats,
      },
      baseStatsTotal: {
        partyA: partyASummary.baseStatsTotal,
        partyB: partyBSummary.baseStatsTotal,
        diff: partyBSummary.baseStatsTotal - partyASummary.baseStatsTotal,
      },
    },
  };
}

export function registerComparePartiesTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const output = comparePartiesAnalysis(args);
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
