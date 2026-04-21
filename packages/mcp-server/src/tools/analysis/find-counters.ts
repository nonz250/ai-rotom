import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import {
  DamageCalculatorAdapter,
  calculateTypeEffectiveness,
  compareSpeed,
  pokemonSchema,
  type BaseStats,
  type BoostsInput,
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

/** 結果の最大件数 */
const TOP_N = 10;

/** スコア重み */
const SCORE_TYPE_ADVANTAGE = 5;
const SCORE_SPEED_WIN = 3;
const SCORE_LOW_INCOMING_DAMAGE = 3;
const SCORE_OHKO = 5;
const SCORE_2HKO = 2;

/** タイプ相性しきい値 */
const SUPER_EFFECTIVE_MIN = 2;
const HALF_EFFECTIVE_MAX = 0.5;
const IMMUNITY_MULTIPLIER = 0;

/** ダメージ割合（%）のしきい値 */
const LOW_INCOMING_DAMAGE_PERCENT_MAX = 30;
const OHKO_PERCENT_MIN = 100;
const TWO_HKO_PERCENT_MIN = 50;

/** 4 倍耐性以上（強耐性）しきい値: 0.25 */
const STRONG_RESIST_MAX = 0.25;

/** Status 技 */
const STATUS_CATEGORY: MoveCategory = "Status";

const TOOL_NAME = "find_counters";
const TOOL_DESCRIPTION =
  "指定したポケモンの対策候補を検索する。候補プール全体に対してダメ計と素早さ比較を行い、スコア順に上位 10 件を返す。"
  + "`strategy` で対策パターン (speed_kill / tank_then_kill / type_wall) を識別する。"
  + "`candidatePool` は文字列（名前のみ）と PokemonInput オブジェクト（ability / item / nature / evs 指定）を混在可能で、同一ポケモンの build 違い比較にも対応する。"
  + "ポケモンチャンピオンズ対応。";

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

export type CounterStrategy = "speed_kill" | "tank_then_kill" | "type_wall";

interface TargetTypeWeakness {
  type: string;
  nameJa: string;
  multiplier: number;
}

interface CounterMoveInfo {
  name: string;
  nameJa: string;
  type: string;
  expectedDamagePercent: { min: number; max: number };
}

interface IncomingMoveInfo {
  name: string;
  nameJa: string;
  type: string;
  receivedDamagePercent: { min: number; max: number };
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

interface CounterDetails {
  speedAdvantage: SpeedComparison;
  bestMove?: CounterMoveInfo;
  incomingBestMove?: IncomingMoveInfo;
}

export interface CounterEntry {
  pokemon: CounterPokemonProfile;
  strategy: CounterStrategy;
  score: number;
  details: CounterDetails;
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
 * DamageCalcResult 一覧から最大ダメ割合（max）の技を返す。
 */
function pickBestMove(
  results: readonly DamageCalcResult[],
): DamageCalcResult | undefined {
  if (results.length === 0) return undefined;
  let best = results[0];
  for (const r of results) {
    if (r.max > best.max) best = r;
  }
  return best;
}

/**
 * 指定ポケモンの learnset に含まれる技 ID セットを取得する。
 * 未登録のポケモンは空 Set を返す。
 */
function getLearnsetMoveIdSet(pokemonId: string): ReadonlySet<string> {
  const learnset = championsLearnsets[pokemonId];
  if (learnset === undefined) return new Set();
  return new Set(learnset);
}

/**
 * calculateAllMoves の結果を attacker の learnset で絞り込む。
 * @smogon/calc は全技を走査するため、実際に覚えない技で過大評価しないようにフィルタする。
 */
function filterResultsByLearnset(
  results: readonly DamageCalcResult[],
  attackerPokemonId: string,
): DamageCalcResult[] {
  const learnsetIds = getLearnsetMoveIdSet(attackerPokemonId);
  if (learnsetIds.size === 0) {
    // learnset データが無い場合はフィルタできないので元のまま返す
    return [...results];
  }
  return results.filter((r) => learnsetIds.has(toDataId(r.move)));
}

/**
 * 被ダメージ % の最大値を元に LowIncoming 判定する。
 */
function isLowIncomingDamage(incomingMaxPercent: number): boolean {
  return incomingMaxPercent <= LOW_INCOMING_DAMAGE_PERCENT_MAX;
}

/**
 * 対策スコアを計算する。設計書の重みに従う。
 */
function calcCounterScore(args: {
  typeAdvantage: boolean;
  speedAdvantage: SpeedComparison;
  incomingMaxPercent: number | null;
  outgoingMaxPercent: number | null;
}): number {
  let score = 0;
  if (args.typeAdvantage) score += SCORE_TYPE_ADVANTAGE;
  if (args.speedAdvantage === "faster") score += SCORE_SPEED_WIN;
  if (
    args.incomingMaxPercent !== null
    && isLowIncomingDamage(args.incomingMaxPercent)
  ) {
    score += SCORE_LOW_INCOMING_DAMAGE;
  }
  if (args.outgoingMaxPercent !== null) {
    if (args.outgoingMaxPercent >= OHKO_PERCENT_MIN) {
      score += SCORE_OHKO;
    } else if (args.outgoingMaxPercent >= TWO_HKO_PERCENT_MIN) {
      score += SCORE_2HKO;
    }
  }
  return score;
}

/**
 * 戦略カテゴリを判定する。優先順: type_wall > speed_kill > tank_then_kill
 * - type_wall: target からの攻撃を無効化 or 0.25 倍以下で受ける
 * - speed_kill: 自分が先制 + 2 発以内で倒せる（OHKO or 2HKO）
 * - tank_then_kill: 半減以下で受け + OHKO/2HKO
 * それ以外はデフォルトで tank_then_kill 扱い（type_wall 未満の耐性 + 倒しきれる想定）。
 */
function classifyStrategy(args: {
  incomingMultiplier: number;
  outgoingMaxPercent: number | null;
  speedAdvantage: SpeedComparison;
}): CounterStrategy {
  const canKillIn2
    = args.outgoingMaxPercent !== null
    && args.outgoingMaxPercent >= TWO_HKO_PERCENT_MIN;

  // type_wall: ほぼ無傷で受けきれる
  if (
    args.incomingMultiplier === IMMUNITY_MULTIPLIER
    || args.incomingMultiplier <= STRONG_RESIST_MAX
  ) {
    return "type_wall";
  }

  // speed_kill: 先制 + 2 発以内で倒せる
  if (args.speedAdvantage === "faster" && canKillIn2) {
    return "speed_kill";
  }

  // 半減で受けつつ倒せる
  if (args.incomingMultiplier <= HALF_EFFECTIVE_MAX && canKillIn2) {
    return "tank_then_kill";
  }

  // デフォルト: tank_then_kill (受けきりながら削る想定)
  return "tank_then_kill";
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
  // target に弱点タイプが 1 つも無い (Normal 等はほぼ無いが念のため) 場合は全件候補にする
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

      // target を解決
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

      // 候補プール選定（前フィルタあり）
      const candidateBuilds = buildCandidateEntries(
        args.candidatePool,
        targetEntry,
        gen,
      );

      // 各候補 vs target のマッチアップをシミュレート
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
          // ポケモンオブジェクト作成できない場合はスキップ
          continue;
        }

        // 両方向ダメ計（learnset でフィルタして実際に覚える技のみ評価する）
        let outgoing: DamageCalcResult[] = [];
        let incoming: DamageCalcResult[] = [];
        try {
          const allOutgoing = calculator.calculateAllMoves({
            attacker: candidateInput,
            defender: args.target,
          });
          outgoing = filterResultsByLearnset(allOutgoing, candidateEntry.id);
        } catch {
          outgoing = [];
        }
        try {
          const allIncoming = calculator.calculateAllMoves({
            attacker: args.target,
            defender: candidateInput,
          });
          incoming = filterResultsByLearnset(allIncoming, targetEntry.id);
        } catch {
          incoming = [];
        }

        const bestOutgoing = pickBestMove(outgoing);
        const bestIncoming = pickBestMove(incoming);

        const speedAdvantage = compareSpeed(
          candidateObj.stats.spe,
          targetObj.stats.spe,
        );

        const outgoingMaxPercent
          = bestOutgoing !== undefined ? bestOutgoing.maxPercent : null;
        const incomingMaxPercent
          = bestIncoming !== undefined ? bestIncoming.maxPercent : null;

        // タイプ有利判定: candidate に 2 倍以上の攻撃技が存在するか
        let typeAdvantage = false;
        if (bestOutgoing !== undefined) {
          // 具体的な move の type を参照
          const outMoveEntry = movesById.get(toDataId(bestOutgoing.move));
          if (outMoveEntry !== undefined) {
            const m = calcMultiplier(
              outMoveEntry.type,
              targetEntry.types,
              gen,
            );
            if (m >= SUPER_EFFECTIVE_MIN) {
              typeAdvantage = true;
            }
          }
        }

        // 被ダメタイプ倍率 (strategy 判定用): target が放つ最大ダメ技の 倍率
        let incomingMultiplier = 1;
        if (bestIncoming !== undefined) {
          const inMoveEntry = movesById.get(toDataId(bestIncoming.move));
          if (inMoveEntry !== undefined) {
            incomingMultiplier = calcMultiplier(
              inMoveEntry.type,
              candidateEntry.types,
              gen,
            );
          }
        }

        const score = calcCounterScore({
          typeAdvantage,
          speedAdvantage,
          incomingMaxPercent,
          outgoingMaxPercent,
        });

        const strategy = classifyStrategy({
          incomingMultiplier,
          outgoingMaxPercent,
          speedAdvantage,
        });

        const nameJa = candidateEntry.nameJa ?? candidateEntry.name;

        const details: CounterDetails = { speedAdvantage };

        if (bestOutgoing !== undefined) {
          const outMoveEntry = movesById.get(toDataId(bestOutgoing.move));
          const outNameJa
            = moveNameResolver.toJapanese(bestOutgoing.move) ?? bestOutgoing.move;
          details.bestMove = {
            name: bestOutgoing.move,
            nameJa: outNameJa,
            type: outMoveEntry?.type ?? "",
            expectedDamagePercent: {
              min: bestOutgoing.minPercent,
              max: bestOutgoing.maxPercent,
            },
          };
        }

        if (bestIncoming !== undefined) {
          const inMoveEntry = movesById.get(toDataId(bestIncoming.move));
          const inNameJa
            = moveNameResolver.toJapanese(bestIncoming.move) ?? bestIncoming.move;
          details.incomingBestMove = {
            name: bestIncoming.move,
            nameJa: inNameJa,
            type: inMoveEntry?.type ?? "",
            receivedDamagePercent: {
              min: bestIncoming.minPercent,
              max: bestIncoming.maxPercent,
            },
          };
        }

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
          strategy,
          score,
          details,
          sortKey: buildSignature(candidate),
        });
      }

      // score 降順、同点は name 昇順、更に同じ名前は build 署名で安定化
      counterEntries.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
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
        counters: counterEntries.slice(0, TOP_N).map(({ sortKey: _sortKey, ...rest }) => rest),
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
