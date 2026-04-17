import { NameResolver } from "@ai-rotom/shared";
import type { NameEntry } from "@ai-rotom/shared";
import pokemonNames from "../data/pokemon-names.json";
import natureNames from "../data/nature-names.json";
import abilitiesData from "../data/champions-abilities.json";
import itemsData from "../data/champions-items.json";
import movesData from "../data/champions-moves.json";

/**
 * champions-*.json のエントリーから {ja, en} ペアの配列を組み立てる。
 * nameJa が null のエントリー（外部 API に日本語名が登録されていない）はスキップする。
 */
function toNameEntries(
  data: readonly { readonly name: string; readonly nameJa: string | null }[],
): NameEntry[] {
  const entries: NameEntry[] = [];
  for (const entry of data) {
    if (entry.nameJa === null) continue;
    entries.push({ ja: entry.nameJa, en: entry.name });
  }
  return entries;
}

export const pokemonNameResolver = new NameResolver(pokemonNames);
export const natureNameResolver = new NameResolver(natureNames);
export const abilityNameResolver = new NameResolver(toNameEntries(abilitiesData));
export const itemNameResolver = new NameResolver(toNameEntries(itemsData));
export const moveNameResolver = new NameResolver(toNameEntries(movesData));
