import type { BaseStats, PokemonEntry, PokemonEntryProvider } from "@ai-rotom/shared";
import abilitiesData from "@data/abilities.json";
import itemsData from "@data/items.json";
import movesData from "@data/moves.json";
import learnsetsData from "@data/learnsets.json";
import pokemonData from "@data/pokemon.json";
import naturesData from "@data/natures.json";
import typesData from "@data/types.json";
import conditionsData from "@data/conditions.json";

export type { BaseStats, PokemonEntry } from "@ai-rotom/shared";

/**
 * 技のカテゴリー。
 * Physical: 物理技 / Special: 特殊技 / Status: 変化技
 */
export type MoveCategory = "Physical" | "Special" | "Status";

/**
 * ポケモンチャンピオンズの特性データ。
 * nameJa は外部 API に登録されていない特性の場合 null となる。
 */
export interface AbilityEntry {
  id: string;
  name: string;
  nameJa: string | null;
  desc: string;
  shortDesc: string;
}

/**
 * ポケモンチャンピオンズの持ち物データ。
 * メガストーンの場合は megaStone / megaEvolves に値が入る。
 * nameJa は外部 API に登録されていない持ち物の場合 null となる。
 */
export interface ItemEntry {
  id: string;
  name: string;
  nameJa: string | null;
  desc: string;
  shortDesc: string;
  /** メガ進化後のポケモン名（例: "Charizard-Mega-X"）。メガストーンでなければ null */
  megaStone: string | null;
  /** メガ進化元のポケモン名（例: "Charizard"）。メガストーンでなければ null */
  megaEvolves: string | null;
}

/**
 * ポケモンチャンピオンズの技データ。
 * nameJa は外部 API に登録されていない技の場合 null となる。
 */
export interface MoveEntry {
  id: string;
  name: string;
  nameJa: string | null;
  type: string;
  category: MoveCategory;
  /** 威力。変化技は 0 */
  basePower: number;
  /**
   * 命中率。
   * 100 などの数値、または必中技の場合は true。
   */
  accuracy: number | true;
  pp: number;
  priority: number;
  target: string;
  flags: string[];
  desc: string;
  shortDesc: string;
}

/**
 * ポケモンの learnset マップ。
 * キーはポケモン ID（kebab-case 小文字）、値は技 ID の配列。
 */
export type LearnsetMap = Record<string, string[]>;

/**
 * 性格による能力補正。
 * plus はステータスが 1.1 倍される能力、minus は 0.9 倍される能力。
 * どちらも null の場合は無補正性格。
 */
export interface NatureEntry {
  id: string;
  name: string;
  nameJa: string;
  plus: string | null;
  minus: string | null;
}

/**
 * ポケモンのタイプデータ。
 */
export interface TypeEntry {
  id: string;
  name: string;
  nameJa: string;
}

/**
 * バトル中の状態（天候・フィールド・状態異常・サイド効果）のエントリ。
 */
export interface ConditionEntry {
  id: string;
  name: string;
  nameJa: string;
}

/**
 * バトル条件データのまとまり。
 * weather: 天候 / terrain: フィールド / status: 状態異常 / sideCondition: サイド効果
 */
export interface ConditionsData {
  weather: ConditionEntry[];
  terrain: ConditionEntry[];
  status: ConditionEntry[];
  sideCondition: ConditionEntry[];
}

export const championsAbilities: AbilityEntry[] =
  abilitiesData as AbilityEntry[];
export const championsItems: ItemEntry[] = itemsData as ItemEntry[];
export const championsMoves: MoveEntry[] = movesData as MoveEntry[];
export const championsLearnsets: LearnsetMap = learnsetsData as LearnsetMap;
export const championsPokemon: PokemonEntry[] = pokemonData as PokemonEntry[];
export const championsNatures: NatureEntry[] = naturesData as NatureEntry[];
export const championsTypes: TypeEntry[] = typesData as TypeEntry[];
export const championsConditions: ConditionsData =
  conditionsData as ConditionsData;

/** 特性 ID → 特性データの Map */
export const abilitiesById: ReadonlyMap<string, AbilityEntry> = new Map(
  championsAbilities.map((a) => [a.id, a]),
);

/** 持ち物 ID → 持ち物データの Map */
export const itemsById: ReadonlyMap<string, ItemEntry> = new Map(
  championsItems.map((i) => [i.id, i]),
);

/** 技 ID → 技データの Map */
export const movesById: ReadonlyMap<string, MoveEntry> = new Map(
  championsMoves.map((m) => [m.id, m]),
);

/** ポケモン ID → ポケモンデータの Map */
export const pokemonById: ReadonlyMap<string, PokemonEntry> = new Map(
  championsPokemon.map((p) => [p.id, p]),
);

/** 性格 ID → 性格データの Map */
export const naturesById: ReadonlyMap<string, NatureEntry> = new Map(
  championsNatures.map((n) => [n.id, n]),
);

/** タイプ ID → タイプデータの Map */
export const typesById: ReadonlyMap<string, TypeEntry> = new Map(
  championsTypes.map((t) => [t.id, t]),
);

/**
 * Showdown 慣例の ID 変換（toID 相当）。
 * 英語名から kebab-case 小文字の ID に変換する。
 * 例: "Charizard-Mega-X" → "charizardmegax", "Acid Spray" → "acidspray"
 */
export function toDataId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * shared/calc モジュールに渡すための PokemonEntryProvider 実装。
 * 英語名から pokemonById Map を引いて PokemonEntry を返す。
 */
export const pokemonEntryProvider: PokemonEntryProvider = {
  getByName: (name: string): PokemonEntry | undefined =>
    pokemonById.get(toDataId(name)),
};

/**
 * 指定ポケモンの learnset に含まれる技 ID セットを取得する。
 * 未登録のポケモンは空 Set を返す（shared の filterResultsByLearnset では
 * 空 Set を「learnset データが無い」フォールバックとして扱う）。
 * learnset JSON の ID は既に Showdown toID 形式だが、呼び出し側の
 * 正規化関数（{@link toDataId}）との対称性を保つため念のため通している。
 */
export function getLearnsetMoveIdSet(
  pokemonId: string,
): ReadonlySet<string> {
  const learnset = championsLearnsets[pokemonId];
  if (learnset === undefined) return new Set();
  return new Set(learnset.map(toDataId));
}
