export { NameResolver } from "./utils/name-resolver";
export type { NameEntry } from "./utils/name-resolver";
export * from "./constants/champions";
export * from "./analysis/type-matchup";
export * from "./analysis/stat-calculator";
export * from "./analysis/speed-comparator";
export * from "./analysis/priority-moves";
export * from "./schemas/pokemon-input";
export * from "./schemas/stats";
export type {
  BaseStats,
  PokemonEntry,
  PokemonEntryProvider,
} from "./types/pokemon.js";

// ダメージ計算モジュール。
// calc/types.ts の PokemonInput / ConditionsInput は
// schemas/pokemon-input.ts の同名型と衝突するため export しない。
// 呼び出し側は @ai-rotom/shared のスキーマ由来 PokemonInput / ConditionsInput を使うこと。
export { DamageCalculatorAdapter } from "./calc/damage-calculator.js";
export type { NameResolvers } from "./calc/damage-calculator.js";
export type {
  StatsInput,
  DamageCalcInput,
  AllMovesCalcInput,
  DamageCalcResult,
  StatusName,
} from "./calc/types.js";
export { filterResultsByLearnset } from "./calc/filters/learnset-filter.js";
