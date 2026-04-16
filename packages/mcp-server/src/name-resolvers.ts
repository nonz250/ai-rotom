import { NameResolver } from "@ai-rotom/shared";
import pokemonNames from "../data/pokemon-names.json";
import moveNames from "../data/move-names.json";
import abilityNames from "../data/ability-names.json";
import itemNames from "../data/item-names.json";
import natureNames from "../data/nature-names.json";

export const pokemonNameResolver = new NameResolver(pokemonNames);
export const moveNameResolver = new NameResolver(moveNames);
export const abilityNameResolver = new NameResolver(abilityNames);
export const itemNameResolver = new NameResolver(itemNames);
export const natureNameResolver = new NameResolver(natureNames);
