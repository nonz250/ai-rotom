import { championsItems, pokemonById, toDataId } from "../data-store.js";
import type { ItemEntry, AbilityEntry } from "../data-store.js";
import { abilitiesById } from "../data-store.js";

export interface MegaResolution {
  /** 日本語メガ種族名 (例: "メガリザードンX") */
  speciesJa: string;
  /** 英語メガ種族名 (例: "Charizard-Mega-X") */
  speciesEn: string;
  /** 日本語メガストーン名 (例: "リザードナイトX") */
  stoneJa: string;
  /** メガ後の特性 (日本語、未取得時は null) */
  abilityJa: string | null;
  /** メガ後の特性 (英語) */
  abilityEn: string | null;
  baseStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  types: string[];
}

/**
 * 日本語メガストーン名 → メガ進化解決情報。
 * pokechamp の `dict.megaStoneToMegaSpecies` 相当を items.json + pokemon.json から
 * 動的に構築する。pokechamp 独自辞書の取り込みは不要。
 */
export const megaStoneToMega: ReadonlyMap<string, MegaResolution> = (() => {
  const map = new Map<string, MegaResolution>();
  for (const item of championsItems) {
    if (item.megaStone === null || item.nameJa === null) continue;
    const megaSpecies = pokemonById.get(toDataId(item.megaStone));
    if (!megaSpecies) continue;
    const abilityEn = megaSpecies.abilities[0] ?? null;
    const abilityEntry: AbilityEntry | undefined = abilityEn
      ? abilitiesById.get(toDataId(abilityEn))
      : undefined;
    map.set(item.nameJa, {
      speciesJa: megaSpecies.nameJa ?? megaSpecies.name,
      speciesEn: megaSpecies.name,
      stoneJa: item.nameJa,
      abilityJa: abilityEntry?.nameJa ?? null,
      abilityEn,
      baseStats: megaSpecies.baseStats,
      types: megaSpecies.types,
    });
  }
  return map;
})();

export function resolveMegaStone(stoneJa: string): MegaResolution | undefined {
  return megaStoneToMega.get(stoneJa);
}

export type { ItemEntry };
