import abilitiesData from "@data/abilities.json";
import itemsData from "@data/items.json";
import movesData from "@data/moves.json";
import learnsetsData from "@data/learnsets.json";

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

export const championsAbilities: AbilityEntry[] =
  abilitiesData as AbilityEntry[];
export const championsItems: ItemEntry[] = itemsData as ItemEntry[];
export const championsMoves: MoveEntry[] = movesData as MoveEntry[];
export const championsLearnsets: LearnsetMap = learnsetsData as LearnsetMap;

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

/**
 * Showdown 慣例の ID 変換（toID 相当）。
 * 英語名から kebab-case 小文字の ID に変換する。
 * 例: "Charizard-Mega-X" → "charizardmegax", "Acid Spray" → "acidspray"
 */
export function toDataId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
