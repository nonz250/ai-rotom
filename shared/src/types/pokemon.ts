/**
 * ポケモンの種族値テーブル。
 */
export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

/**
 * ポケモンチャンピオンズのポケモンデータ。
 * nameJa は外部 API に登録されていないポケモンの場合 null となる。
 * abilities は通常特性 1〜2 + 隠れ特性の順で並ぶ。
 * baseSpecies はメガ進化等の派生フォームの場合、元ポケモンの英語名が入る。
 */
export interface PokemonEntry {
  id: string;
  name: string;
  nameJa: string | null;
  types: string[];
  baseStats: BaseStats;
  abilities: string[];
  weightkg: number;
  baseSpecies: string | null;
  otherFormes: string[] | null;
}

/**
 * PokemonEntry を英語名で引くためのプロバイダ。
 * ダメージ計算モジュールが data-store に直接依存しないよう、DI で受け取るための抽象。
 */
export interface PokemonEntryProvider {
  /**
   * 英語名 (例: "Starmie-Mega") から PokemonEntry を取得する。
   * 未登録なら undefined を返す。
   */
  getByName(name: string): PokemonEntry | undefined;
}
