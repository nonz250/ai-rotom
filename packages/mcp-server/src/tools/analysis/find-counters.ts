import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import {
  DamageCalculatorAdapter,
  calculateTypeEffectiveness,
  compareSpeed,
  filterResultsByLearnset,
  pokemonSchema,
  type BaseStats,
  type BoostsInput,
  type ConditionsInput,
  type DamageCalcResult,
  type EvsInput,
  type PokemonEntry,
  type PokemonInput,
  type SpeedComparison,
} from "@ai-rotom/shared";
import {
  championsLearnsets,
  championsPokemon,
  championsTypes,
  getLearnsetMoveIdSet,
  movesById,
  pokemonById,
  pokemonEntryProvider,
  toDataId,
  type MoveCategory,
} from "../../data-store.js";
import {
  abilityNameResolver,
  itemNameResolver,
  moveNameResolver,
  natureNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";

const CHAMPIONS_GEN_NUM = 0;

/** 弱点タイプ判定のしきい値（候補プール抽出で使用） */
const SUPER_EFFECTIVE_MIN = 2;

/** Status 技 */
const STATUS_CATEGORY: MoveCategory = "Status";

const TOOL_NAME = "find_counters";
const TOOL_DESCRIPTION =
  "target の弱点タイプ攻撃技を持つポケモンを候補プールとして抽出し、各候補の双方向ダメ計・素早さ・タイプ相性を返す。"
  + "`candidatePool` は文字列（名前のみ）と PokemonInput オブジェクト（ability / item / nature / evs 指定）を混在可能で、同一ポケモンの build 違い比較にも対応する。"
  + "正確な計算のため target 側の ability / item の指定を推奨（省略時は通常特性・持ち物なし扱い）。"
  + "判断（受け型か速度勝ち型か等）は AI が行う前提。ポケモンチャンピオンズ対応。";

const battleFormatValues = ["singles", "doubles"] as const;

const candidatePoolItemSchema = z.union([z.string(), pokemonSchema]);

const inputSchema = {
  target: pokemonSchema.describe("対策したい相手ポケモン"),
  candidatePool: z
    .array(candidatePoolItemSchema)
    .optional()
    .describe(
      "候補プール。各要素は「ポケモン名の文字列（簡易指定、デフォルト build で評価）」または「PokemonInput オブジェクト（name に加え ability / item / nature / evs / boosts / status を指定可能）」。"
      + "同じポケモン名でも build 違いを並列で比較できる。"
      + "未指定時は target の弱点タイプ攻撃技を覚える Champions 全ポケモンから自動選定（デフォルト build 評価）。",
    ),
  battleFormat: z
    .enum(battleFormatValues)
    .optional()
    .describe("対戦形式（省略時: singles）"),
};

type CandidatePoolItem = z.infer<typeof candidatePoolItemSchema>;

interface TargetTypeWeakness {
  type: string;
  nameJa: string;
  multiplier: number;
}

/**
 * 候補が具体 build 指定で評価された場合の指定内容。
 * 文字列（名前のみ）で指定された候補・自動選定された候補では省略される。
 */
export interface CounterBuildInfo {
  ability?: string;
  item?: string;
  nature?: string;
  evs?: EvsInput;
  boosts?: BoostsInput;
  status?: string;
}

interface CounterPokemonProfile {
  id: string;
  name: string;
  nameJa: string;
  types: string[];
  baseStats: BaseStats;
  abilities: string[];
  build?: CounterBuildInfo;
}

export interface CounterEntry {
  pokemon: CounterPokemonProfile;
  speedCompare: SpeedComparison;
  outgoing: DamageCalcResult[];
  incoming: DamageCalcResult[];
}

export interface TargetInfo {
  name: string;
  nameJa: string;
  stats: BaseStats;
  typeWeaknesses: TargetTypeWeakness[];
}

export interface FindCountersOutput {
  target: TargetInfo;
  counters: CounterEntry[];
}

/**
 * ポケモン名を pokemon.json のエントリに解決する。
 */
function resolvePokemonEntry(name: string): PokemonEntry {
  const englishName
    = pokemonNameResolver.toEnglish(name)
    ?? (pokemonNameResolver.hasEnglishName(name) ? name : null);

  if (englishName === null) {
    const suggestions = pokemonNameResolver.suggestSimilar(name);
    const suggestionMessage
      = suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
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
 * 攻撃タイプから防御タイプ配列への複合倍率を算出する。
 */
function calcMultiplier(
  attackTypeName: string,
  defenderTypes: readonly string[],
  gen: ReturnType<typeof Generations.get>,
): number {
  return calculateTypeEffectiveness(
    gen,
    attackTypeName as TypeName,
    defenderTypes as readonly TypeName[],
  );
}

/**
 * target のタイプに対して 2 倍以上の弱点タイプを洗い出す。
 */
function findTypeWeaknesses(
  defenderTypes: readonly string[],
  gen: ReturnType<typeof Generations.get>,
): TargetTypeWeakness[] {
  const typeJaMap = new Map(championsTypes.map((t) => [t.name, t.nameJa]));
  const weaknesses: TargetTypeWeakness[] = [];

  for (const attackerType of championsTypes) {
    const m = calcMultiplier(attackerType.name, defenderTypes, gen);
    if (m >= SUPER_EFFECTIVE_MIN) {
      weaknesses.push({
        type: attackerType.name,
        nameJa: typeJaMap.get(attackerType.name) ?? attackerType.name,
        multiplier: m,
      });
    }
  }

  weaknesses.sort((a, b) => {
    if (a.multiplier !== b.multiplier) return b.multiplier - a.multiplier;
    return a.type.localeCompare(b.type);
  });

  return weaknesses;
}

/**
 * ポケモンが指定タイプ集合のいずれかに属する攻撃技を覚えるかを判定する。
 * 前フィルタとして使用。
 */
function hasAttackingMoveOfAnyType(
  pokemonId: string,
  weaknessTypes: ReadonlySet<string>,
): boolean {
  const learnset = championsLearnsets[pokemonId];
  if (learnset === undefined) return false;
  for (const moveId of learnset) {
    const move = movesById.get(moveId);
    if (move === undefined) continue;
    if (move.category === STATUS_CATEGORY) continue;
    if (weaknessTypes.has(move.type)) return true;
  }
  return false;
}

/**
 * ターゲットのタイプに対して弱点となるタイプ集合を算出する。
 */
function buildWeaknessTypeSet(
  targetTypes: readonly string[],
  gen: ReturnType<typeof Generations.get>,
): Set<string> {
  const set = new Set<string>();
  for (const attackerType of championsTypes) {
    const m = calcMultiplier(attackerType.name, targetTypes, gen);
    if (m >= SUPER_EFFECTIVE_MIN) {
      set.add(attackerType.name);
    }
  }
  return set;
}

/**
 * 評価対象の候補。
 * - entry: pokemon.json から解決された PokemonEntry
 * - input: DamageCalculatorAdapter に渡す PokemonInput（文字列指定は { name } に正規化済み）
 * - hasExplicitBuild: 明示的に build が指定された候補か
 */
export interface CandidateBuild {
  entry: PokemonEntry;
  input: PokemonInput;
  hasExplicitBuild: boolean;
}

/**
 * PokemonInput から build 部分（name 以外）を抽出する。
 * 省略されたフィールドは含めない。
 */
export function extractBuildInfo(input: PokemonInput): CounterBuildInfo {
  const build: CounterBuildInfo = {};
  if (input.ability !== undefined) build.ability = input.ability;
  if (input.item !== undefined) build.item = input.item;
  if (input.nature !== undefined) build.nature = input.nature;
  if (input.evs !== undefined) build.evs = input.evs;
  if (input.boosts !== undefined) build.boosts = input.boosts;
  if (input.status !== undefined) build.status = input.status;
  return build;
}

/**
 * 候補のソート用 tiebreaker として使う安定的な署名を生成する。
 * 同名ポケモンの build 違いを区別する。build 未指定（string or 自動選定）は "default" 扱い。
 */
export function buildSignature(candidate: CandidateBuild): string {
  if (!candidate.hasExplicitBuild) return "default";
  return JSON.stringify(extractBuildInfo(candidate.input));
}

/**
 * 候補プールを決定する。
 * - candidatePool 指定時: 各要素（string or PokemonInput）を正規化して CandidateBuild 配列で返す。
 * - 未指定時: target のタイプ弱点を攻撃技として持つ全 Champions ポケモンに絞る（デフォルト build）。
 */
export function buildCandidateEntries(
  candidatePool: readonly CandidatePoolItem[] | undefined,
  target: PokemonEntry,
  gen: ReturnType<typeof Generations.get>,
): CandidateBuild[] {
  if (candidatePool !== undefined) {
    const candidates: CandidateBuild[] = [];
    for (const item of candidatePool) {
      if (typeof item === "string") {
        const entry = resolvePokemonEntry(item);
        candidates.push({
          entry,
          input: { name: entry.name },
          hasExplicitBuild: false,
        });
      } else {
        const entry = resolvePokemonEntry(item.name);
        candidates.push({
          entry,
          input: { ...item, name: entry.name },
          hasExplicitBuild: true,
        });
      }
    }
    return candidates;
  }

  const weaknessTypes = buildWeaknessTypeSet(target.types, gen);
  const baseEntries
    = weaknessTypes.size === 0
      ? [...championsPokemon].filter((p) => p.id !== target.id)
      : championsPokemon.filter(
        (p) =>
          p.id !== target.id && hasAttackingMoveOfAnyType(p.id, weaknessTypes),
      );

  return baseEntries.map((entry) => ({
    entry,
    input: { name: entry.name },
    hasExplicitBuild: false,
  }));
}

export function registerFindCountersTool(server: McpServer): void {
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

      const damageConditions: ConditionsInput = {
        battleFormat: args.battleFormat,
      };

      const targetEntry = resolvePokemonEntry(args.target.name);
      const { pokemon: targetObj, resolvedName: targetName }
        = calculator.createPokemonObject(args.target);
      const targetNameJa
        = pokemonNameResolver.toJapanese(targetName) ?? targetName;

      const typeWeaknesses = findTypeWeaknesses(targetEntry.types, gen);

      const targetStats: BaseStats = {
        hp: targetObj.stats.hp,
        atk: targetObj.stats.atk,
        def: targetObj.stats.def,
        spa: targetObj.stats.spa,
        spd: targetObj.stats.spd,
        spe: targetObj.stats.spe,
      };

      const candidateBuilds = buildCandidateEntries(
        args.candidatePool,
        targetEntry,
        gen,
      );

      const counterEntries: Array<CounterEntry & { sortKey: string }> = [];

      for (const candidate of candidateBuilds) {
        const candidateEntry = candidate.entry;
        const candidateInput = candidate.input;

        let candidateObj: ReturnType<
          typeof calculator.createPokemonObject
        >["pokemon"];
        try {
          const created = calculator.createPokemonObject(candidateInput);
          candidateObj = created.pokemon;
        } catch {
          continue;
        }

        let outgoing: DamageCalcResult[] = [];
        let incoming: DamageCalcResult[] = [];
        try {
          const allOutgoing = calculator.calculateAllMoves({
            attacker: candidateInput,
            defender: args.target,
            conditions: damageConditions,
          });
          const candidateLearnsetIds = getLearnsetMoveIdSet(candidateEntry.id);
          outgoing = filterResultsByLearnset(
            allOutgoing,
            candidateLearnsetIds,
            toDataId,
          );
        } catch {
          outgoing = [];
        }
        try {
          const allIncoming = calculator.calculateAllMoves({
            attacker: args.target,
            defender: candidateInput,
            conditions: damageConditions,
          });
          const targetLearnsetIds = getLearnsetMoveIdSet(targetEntry.id);
          incoming = filterResultsByLearnset(
            allIncoming,
            targetLearnsetIds,
            toDataId,
          );
        } catch {
          incoming = [];
        }

        const speedCompare = compareSpeed(
          candidateObj.stats.spe,
          targetObj.stats.spe,
        );

        const nameJa = candidateEntry.nameJa ?? candidateEntry.name;

        const pokemonProfile: CounterPokemonProfile = {
          id: candidateEntry.id,
          name: candidateEntry.name,
          nameJa,
          types: [...candidateEntry.types],
          baseStats: { ...candidateEntry.baseStats },
          abilities: [...candidateEntry.abilities],
        };

        if (candidate.hasExplicitBuild) {
          pokemonProfile.build = extractBuildInfo(candidateInput);
        }

        counterEntries.push({
          pokemon: pokemonProfile,
          speedCompare,
          outgoing,
          incoming,
          sortKey: buildSignature(candidate),
        });
      }

      counterEntries.sort((a, b) => {
        const nameOrder = a.pokemon.name.localeCompare(b.pokemon.name);
        if (nameOrder !== 0) return nameOrder;
        return a.sortKey.localeCompare(b.sortKey);
      });

      const output: FindCountersOutput = {
        target: {
          name: targetName,
          nameJa: targetNameJa,
          stats: targetStats,
          typeWeaknesses,
        },
        counters: counterEntries.map(({ sortKey: _sortKey, ...rest }) => rest),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
      };
    } catch (error: unknown) {
      const message
        = error instanceof Error ? error.message : "不明なエラーが発生しました";
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: message }) },
        ],
        isError: true,
      };
    }
  });
}
