import { Pokemon } from "@smogon/calc";
import type { PokemonEntry } from "../../types/pokemon.js";
import type { PokemonInput, StatsInput, StatusName } from "../types.js";

/**
 * PokemonInput の evs を @smogon/calc が期待する Partial<Stats> 形式に変換する。
 * undefined の場合は空オブジェクトを返す。
 */
function toSmogonEvs(
  evs: Partial<StatsInput> | undefined,
): Partial<{ hp: number; atk: number; def: number; spa: number; spd: number; spe: number }> {
  if (evs === undefined) {
    return {};
  }
  return { ...evs };
}

/**
 * PokemonInput の boosts を @smogon/calc が期待する Partial<Stats> 形式に変換する。
 * undefined の場合は空オブジェクトを返す。
 */
function toSmogonBoosts(
  boosts: Partial<StatsInput> | undefined,
): Partial<{ hp: number; atk: number; def: number; spa: number; spd: number; spe: number }> {
  if (boosts === undefined) {
    return {};
  }
  return { ...boosts };
}

/**
 * PokemonEntry から @smogon/calc の overrides オプション用オブジェクトを作る。
 * @smogon/calc の Specie 型は types を文字列 union のタプル ([TypeName] | [TypeName, TypeName]) として
 * 厳密に定義しているが、PokemonEntry 側は string[] で保持するため、呼び出し側でキャストする。
 */
function buildSpeciesOverrides(
  entry: PokemonEntry,
): {
  // @smogon/calc の Specie.types / baseStats に相当する形へキャストを委ねるため unknown にする
  types: unknown;
  baseStats: PokemonEntry["baseStats"];
} {
  return {
    types: entry.types,
    baseStats: entry.baseStats,
  };
}

/**
 * PokemonInput から @smogon/calc の Pokemon コンストラクタに渡す options を組み立てる。
 *
 * pokemonEntry が与えられた場合は以下の動作:
 *   - baseStats / types を overrides で上書き（修正済み種族値・タイプを反映）
 *   - ability が未指定なら pokemonEntry の 1 番目の特性（通常特性）をデフォルトに設定
 * pokemonEntry が undefined の場合は override 無し（@smogon/calc の内蔵データで動作）。
 *
 * pokemonEntry は呼び出し側（mcp-server など）から注入される。
 * このモジュールは data-store に直接依存しない。
 */
export function buildPokemonOptions(
  input: PokemonInput,
  natureEn: string,
  abilityEn: string | undefined,
  itemEn: string | undefined,
  pokemonEntry: PokemonEntry | undefined,
): ConstructorParameters<typeof Pokemon>[2] {
  const baseOptions: ConstructorParameters<typeof Pokemon>[2] = {
    nature: natureEn,
    evs: toSmogonEvs(input.evs),
    boosts: toSmogonBoosts(input.boosts),
    ability: abilityEn ?? pokemonEntry?.abilities[0],
    item: itemEn,
    status: (input.status ?? "") as StatusName,
  };

  if (pokemonEntry !== undefined) {
    // @smogon/calc の Specie.types は文字列 union のタプル型。
    // PokemonEntry では string[] で保持しているため、overrides の型要件に合わせてキャストする。
    baseOptions.overrides = buildSpeciesOverrides(pokemonEntry) as NonNullable<
      ConstructorParameters<typeof Pokemon>[2]
    >["overrides"];
  }

  return baseOptions;
}
