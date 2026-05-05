import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations, Pokemon } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import { calculateTypeEffectiveness } from "@ai-rotom/shared";
import {
  championsLearnsets,
  championsTypes,
  movesById,
  pokemonById,
  toDataId,
  type BaseStats,
  type MoveCategory,
  type PokemonEntry,
} from "../../data-store.js";
import {
  abilityNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";
import { TOOL_RESPONSE_HINT_CONTENT } from "../../tool-response-hint.js";

const CHAMPIONS_GEN_NUM = 0;

/** デフォルト実数値計算に使う無補正性格 */
const NEUTRAL_NATURE_EN = "Serious";

/** 4 倍超ダメージ扱いになるしきい値 (弱点) */
const WEAKNESS_MIN = 1;

/** 無効化倍率 */
const IMMUNITY_MULTIPLIER = 0;

/** Status 技の category 値 */
const STATUS_CATEGORY: MoveCategory = "Status";

const TOOL_NAME = "get_pokemon_summary";
const TOOL_DESCRIPTION =
  "ポケモンの総合プロファイル（基本情報・防御相性・覚える技の集計・実数値）を一度に取得する。"
  + "ユーザー発話にポケモン名が出てきて詳細な分析や役割評価が必要な場合は、知識ベースで即答せず、まずこのツールを呼んでデータを引くこと。"
  + "対戦での役割把握や初期分析に使用する。ポケモンチャンピオンズ対応。";

const inputSchema = {
  name: z.string().describe("ポケモン名（日本語 or 英語）"),
};

interface BasicProfile {
  id: string;
  name: string;
  nameJa: string;
  types: string[];
  typesJa: string[];
  baseStats: BaseStats;
  bst: number;
  abilities: string[];
  abilitiesJa: string[];
  weightkg: number;
  baseSpecies: string | null;
  otherFormes: string[] | null;
}

interface DefenseEntry {
  type: string;
  nameJa: string;
  multiplier: number;
}

interface ImmunityEntry {
  type: string;
  nameJa: string;
}

interface DefensesProfile {
  weaknesses: DefenseEntry[];
  resistances: DefenseEntry[];
  immunities: ImmunityEntry[];
}

interface LearnableMoveTypeCount {
  type: string;
  nameJa: string;
  count: number;
}

interface LearnableMovesProfile {
  count: number;
  byType: LearnableMoveTypeCount[];
  byCategory: {
    physical: number;
    special: number;
    status: number;
  };
}

export interface PokemonSummaryOutput {
  basic: BasicProfile;
  defenses: DefensesProfile;
  learnableMoves: LearnableMovesProfile;
  derivedStats: BaseStats;
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
 * 種族値合計 (BST) を計算する。
 */
function calculateBst(stats: BaseStats): number {
  return stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe;
}

/**
 * タイプ英名 → 日本語名マップを構築する。
 */
function buildTypeJaMap(): Map<string, string> {
  return new Map(championsTypes.map((t) => [t.name, t.nameJa]));
}

/**
 * 防御相性を算出する。
 * 18 タイプそれぞれからの被ダメージ倍率（2 タイプ複合は掛け合わせ）を返し、
 * 弱点 / 半減 / 無効 に分類する。1.0 は省略する。
 */
function buildDefensesProfile(
  defenderTypes: readonly string[],
  gen: ReturnType<typeof Generations.get>,
  typeJaMap: Map<string, string>,
): DefensesProfile {
  const weaknesses: DefenseEntry[] = [];
  const resistances: DefenseEntry[] = [];
  const immunities: ImmunityEntry[] = [];

  const defenders = defenderTypes as readonly TypeName[];

  for (const attackerType of championsTypes) {
    const multiplier = calculateTypeEffectiveness(
      gen,
      attackerType.name as TypeName,
      defenders,
    );

    if (multiplier === IMMUNITY_MULTIPLIER) {
      immunities.push({
        type: attackerType.name,
        nameJa: typeJaMap.get(attackerType.name) ?? attackerType.name,
      });
    } else if (multiplier > WEAKNESS_MIN) {
      weaknesses.push({
        type: attackerType.name,
        nameJa: typeJaMap.get(attackerType.name) ?? attackerType.name,
        multiplier,
      });
    } else if (multiplier < WEAKNESS_MIN) {
      resistances.push({
        type: attackerType.name,
        nameJa: typeJaMap.get(attackerType.name) ?? attackerType.name,
        multiplier,
      });
    }
    // multiplier === 1 は省略
  }

  // ソート: 弱点は倍率降順 → タイプ名昇順、耐性は倍率昇順 → タイプ名昇順
  weaknesses.sort((a, b) => {
    if (a.multiplier !== b.multiplier) return b.multiplier - a.multiplier;
    return a.type.localeCompare(b.type);
  });
  resistances.sort((a, b) => {
    if (a.multiplier !== b.multiplier) return a.multiplier - b.multiplier;
    return a.type.localeCompare(b.type);
  });
  immunities.sort((a, b) => a.type.localeCompare(b.type));

  return { weaknesses, resistances, immunities };
}

/**
 * 覚える技の集計を行う。
 * - count: 全技の総数
 * - byType: 攻撃技（Status 以外）のタイプ別集計
 * - byCategory: 物理 / 特殊 / 変化 の内訳
 */
function buildLearnableMovesProfile(
  pokemonEntryId: string,
  typeJaMap: Map<string, string>,
): LearnableMovesProfile {
  const learnset = championsLearnsets[pokemonEntryId];
  if (learnset === undefined) {
    return {
      count: 0,
      byType: [],
      byCategory: { physical: 0, special: 0, status: 0 },
    };
  }

  let physical = 0;
  let special = 0;
  let status = 0;
  const typeCountMap = new Map<string, number>();

  for (const moveId of learnset) {
    const move = movesById.get(moveId);
    if (move === undefined) continue;

    if (move.category === "Physical") physical += 1;
    else if (move.category === "Special") special += 1;
    else status += 1;

    // byType は攻撃技のみ集計
    if (move.category !== STATUS_CATEGORY) {
      typeCountMap.set(move.type, (typeCountMap.get(move.type) ?? 0) + 1);
    }
  }

  const byType: LearnableMoveTypeCount[] = [];
  for (const [type, count] of typeCountMap) {
    byType.push({
      type,
      nameJa: typeJaMap.get(type) ?? type,
      count,
    });
  }
  // count 降順 → type 名昇順
  byType.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.type.localeCompare(b.type);
  });

  return {
    count: learnset.length,
    byType,
    byCategory: { physical, special, status },
  };
}

/**
 * Lv50・IV31・SP 0・無補正でのデフォルト実数値を @smogon/calc 経由で計算する。
 */
function buildDerivedStats(
  entry: PokemonEntry,
  gen: ReturnType<typeof Generations.get>,
): BaseStats {
  const pokemon = new Pokemon(gen, entry.name, {
    nature: NEUTRAL_NATURE_EN,
    evs: {},
    overrides: {
      types: entry.types,
      baseStats: entry.baseStats,
    } as NonNullable<ConstructorParameters<typeof Pokemon>[2]>["overrides"],
  });
  return {
    hp: pokemon.stats.hp,
    atk: pokemon.stats.atk,
    def: pokemon.stats.def,
    spa: pokemon.stats.spa,
    spd: pokemon.stats.spd,
    spe: pokemon.stats.spe,
  };
}

/**
 * 基本プロファイルを構築する。
 */
function buildBasicProfile(
  entry: PokemonEntry,
  typeJaMap: Map<string, string>,
): BasicProfile {
  const nameJa = entry.nameJa ?? entry.name;
  const typesJa = entry.types.map((t) => typeJaMap.get(t) ?? t);
  const abilitiesJa = entry.abilities.map(
    (a) => abilityNameResolver.toJapanese(a) ?? a,
  );

  return {
    id: entry.id,
    name: entry.name,
    nameJa,
    types: [...entry.types],
    typesJa,
    baseStats: { ...entry.baseStats },
    bst: calculateBst(entry.baseStats),
    abilities: [...entry.abilities],
    abilitiesJa,
    weightkg: entry.weightkg,
    baseSpecies: entry.baseSpecies,
    otherFormes: entry.otherFormes !== null ? [...entry.otherFormes] : null,
  };
}

export function registerPokemonSummaryTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const entry = resolvePokemonEntry(args.name);
      const gen = Generations.get(CHAMPIONS_GEN_NUM);
      const typeJaMap = buildTypeJaMap();

      const basic = buildBasicProfile(entry, typeJaMap);
      const defenses = buildDefensesProfile(entry.types, gen, typeJaMap);
      const learnableMoves = buildLearnableMovesProfile(entry.id, typeJaMap);
      const derivedStats = buildDerivedStats(entry, gen);

      const output: PokemonSummaryOutput = {
        basic,
        defenses,
        learnableMoves,
        derivedStats,
      };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(output) },
          TOOL_RESPONSE_HINT_CONTENT,
        ],
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
