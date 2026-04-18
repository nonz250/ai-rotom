/**
 * ダメージ計算で使用する型定義。
 * damage-calculator.ts・各種 builder・formatter・呼び出し側から参照される。
 */

export interface StatsInput {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface PokemonInput {
  name: string;
  nature?: string;
  evs?: Partial<StatsInput>;
  ability?: string;
  item?: string;
  boosts?: Partial<StatsInput>;
  status?: string;
}

export interface ConditionsInput {
  weather?: string;
  terrain?: string;
  isReflect?: boolean;
  isLightScreen?: boolean;
  isAuroraVeil?: boolean;
  isCriticalHit?: boolean;
}

export interface DamageCalcInput {
  attacker: PokemonInput;
  defender: PokemonInput;
  moveName: string;
  conditions?: ConditionsInput;
}

export interface AllMovesCalcInput {
  attacker: PokemonInput;
  defender: PokemonInput;
  conditions?: ConditionsInput;
}

export interface DamageCalcResult {
  attacker: string;
  defender: string;
  move: string;
  damage: number[];
  min: number;
  max: number;
  minPercent: number;
  maxPercent: number;
  koChance: string;
  description: string;
}

/**
 * @smogon/calc の Pokemon コンストラクタが受け取る status の型。
 * pokemon.json 側は string で保持しているためキャスト用に定義している。
 */
export type StatusName = "" | "psn" | "tox" | "brn" | "par" | "slp" | "frz";

// PokemonEntryProvider は types/pokemon.ts で定義。
// ダメージ計算モジュールの外部から DI されるので、calc/types.ts から re-export して
// 呼び出し側が calc/types.ts 1 箇所でダメージ計算関連の型を拾えるようにする。
export type { PokemonEntryProvider } from "../types/pokemon.js";
