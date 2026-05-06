import { DamageCalculatorAdapter } from "@ai-rotom/shared";
import { pokemonEntryProvider } from "../data-store.js";
import {
  abilityNameResolver,
  itemNameResolver,
  moveNameResolver,
  natureNameResolver,
  pokemonNameResolver,
} from "../name-resolvers.js";

/**
 * フォーク独自ツール (calculate_damage_with_protection / verify_claims /
 * analyze_party_vs_meta) で共通利用する DamageCalculatorAdapter ファクトリ。
 * ai-rotom 既存の data-store / name-resolvers を使う。
 *
 * ai-rotom 上流の damage-calculation.ts も同等の createCalculator() を持つが、
 * upstream マージ性のため触らず、本ファイルで重複を集約する。
 */
export function createDamageCalculator(): DamageCalculatorAdapter {
  return new DamageCalculatorAdapter(
    {
      pokemon: pokemonNameResolver,
      move: moveNameResolver,
      ability: abilityNameResolver,
      item: itemNameResolver,
      nature: natureNameResolver,
    },
    pokemonEntryProvider,
  );
}
