import { DamageCalculatorAdapter } from "@ai-rotom/shared";
import { learnsetProvider, pokemonEntryProvider } from "../data-store.js";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../name-resolvers.js";

export const damageCalculator = new DamageCalculatorAdapter(
  {
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  },
  pokemonEntryProvider,
  learnsetProvider,
);
