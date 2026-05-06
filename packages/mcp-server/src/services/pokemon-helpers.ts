import type { TypeName } from "@smogon/calc";
import { movesById, pokemonById, toDataId } from "../data-store.js";
import { moveNameResolver, pokemonNameResolver } from "../name-resolvers.js";

export interface ResolvedPokemon {
  types: TypeName[];
  nameJa: string | null;
  nameEn: string;
  baseSpecies: string | null;
}

/**
 * 日本語 or 英語のポケモン名から ai-rotom データを引き、tipos を含む情報を返す。
 * フォーク独自ツール群 (verify_claims / analyze_party_vs_meta) で共通利用。
 */
export function resolvePokemonByName(name: string): ResolvedPokemon | null {
  const en =
    pokemonNameResolver.toEnglish(name) ??
    (pokemonNameResolver.hasEnglishName(name) ? name : null);
  if (!en) return null;
  const entry = pokemonById.get(toDataId(en));
  if (!entry) return null;
  return {
    types: entry.types as TypeName[],
    nameJa: entry.nameJa,
    nameEn: entry.name,
    baseSpecies: entry.baseSpecies ?? null,
  };
}

/**
 * 日本語 or 英語の技名から ai-rotom データを引いて技タイプを返す。
 * 取得できない場合は null。
 */
export function moveTypeByName(name: string): string | null {
  const en =
    moveNameResolver.toEnglish(name) ??
    (moveNameResolver.hasEnglishName(name) ? name : null);
  if (!en) return null;
  return movesById.get(toDataId(en))?.type ?? null;
}
