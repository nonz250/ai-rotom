import { NameResolver } from "@ai-rotom/shared";
import type { NameEntry } from "@ai-rotom/shared";
import pokemonData from "@data/pokemon.json";
import naturesData from "@data/natures.json";
import abilitiesData from "@data/abilities.json";
import itemsData from "@data/items.json";
import movesData from "@data/moves.json";

/**
 * champions 配下の JSON エントリから {ja, en} ペアの配列を組み立てる。
 * nameJa が null のエントリーはスキップする。
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

export const pokemonNameResolver = new NameResolver(toNameEntries(pokemonData));
export const natureNameResolver = new NameResolver(toNameEntries(naturesData));
export const abilityNameResolver = new NameResolver(toNameEntries(abilitiesData));
export const itemNameResolver = new NameResolver(toNameEntries(itemsData));
export const moveNameResolver = new NameResolver(toNameEntries(movesData));
