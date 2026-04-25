import type { Generation, TypeName } from "@smogon/calc/dist/data/interface";
import { calculateTypeEffectiveness } from "./type-matchup.js";
import {
  applyDefensiveOverrides,
  type DefensiveContextOverrides,
} from "./defensive-ability-overrides.js";
import type { BaseStats } from "../types/pokemon.js";

/** 弱点判定のしきい値 (2 倍以上を弱点とみなす) */
export const WEAKNESS_THRESHOLD = 2;

/** 耐性判定のしきい値 (1 未満を耐性とみなす) */
export const RESISTANCE_THRESHOLD = 1;

/** 無効判定のしきい値 (0 倍を無効とみなす) */
export const IMMUNITY_THRESHOLD = 0;

/** ??? タイプは計算対象から除外するためのマーカー */
const UNKNOWN_TYPE_NAME = "???";

/** 偶奇判定に使う剰余の除数 (中央値計算で偶数長を判定するため) */
const EVEN_ODD_MODULUS = 2;

/** 中央値計算の偶数長時に合計を半分にするための除数 */
const MEDIAN_AVERAGE_DIVISOR = 2;

/** 攻撃タイプと対象ポケモンへの最終倍率。 */
export interface TypeMultiplier {
  type: string;
  multiplier: number;
}

/** 単体ポケモンのタイプ相性分類結果。 */
export interface PokemonTypeMatchups {
  weaknesses: TypeMultiplier[];
  resistances: TypeMultiplier[];
  immunities: string[];
}

/**
 * 単体ポケモンのタイプ構成に対する全攻撃タイプの相性を分類する。
 * 倍率 >= 2 を weaknesses、< 1 を resistances、0 を immunities に振り分ける。
 *
 * `context` を渡すと特性 (Levitate / Filter 等) を加味した補正を適用する。
 * 省略時は純粋なタイプ相性のみで分類する。
 */
export function classifyPokemonTypeMatchups(
  pokemonTypes: readonly string[],
  gen: Generation,
  context: DefensiveContextOverrides = {},
): PokemonTypeMatchups {
  const weaknesses: TypeMultiplier[] = [];
  const resistances: TypeMultiplier[] = [];
  const immunities: string[] = [];

  const defenderTypes = pokemonTypes as readonly TypeName[];

  for (const attackType of gen.types) {
    if (attackType.name === UNKNOWN_TYPE_NAME) {
      continue;
    }

    const base = calculateTypeEffectiveness(
      gen,
      attackType.name,
      defenderTypes,
    );
    const multiplier = applyDefensiveOverrides(base, attackType.name, context);

    if (multiplier === IMMUNITY_THRESHOLD) {
      immunities.push(attackType.name);
    } else if (multiplier >= WEAKNESS_THRESHOLD) {
      weaknesses.push({ type: attackType.name, multiplier });
    } else if (multiplier < RESISTANCE_THRESHOLD) {
      resistances.push({ type: attackType.name, multiplier });
    }
  }

  return { weaknesses, resistances, immunities };
}

/**
 * パーティ全メンバーの「弱点タイプ」のユニーク集合を返す。
 * あるタイプに対して 2 倍以上の弱点を持つメンバーが 1 体でもいれば含まれる。
 */
export function collectPartyWeaknessTypes(
  memberTypes: readonly (readonly string[])[],
  gen: Generation,
): Set<string> {
  const result = new Set<string>();
  for (const types of memberTypes) {
    const { weaknesses } = classifyPokemonTypeMatchups(types, gen);
    for (const w of weaknesses) {
      result.add(w.type);
    }
  }
  return result;
}

/**
 * パーティ全メンバーの「耐性タイプ (半減・無効)」のユニーク集合を返す。
 * あるタイプに対して半減以下の耐性を持つメンバーが 1 体でもいれば含まれる。
 */
export function collectPartyResistanceTypes(
  memberTypes: readonly (readonly string[])[],
  gen: Generation,
): Set<string> {
  const result = new Set<string>();
  for (const types of memberTypes) {
    const { resistances, immunities } = classifyPokemonTypeMatchups(types, gen);
    for (const r of resistances) {
      result.add(r.type);
    }
    for (const t of immunities) {
      result.add(t);
    }
  }
  return result;
}

/** 数値配列の基本統計量。 */
export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  median: number;
}

/**
 * 数値配列の min / max / mean / median を返す。
 * 空配列は全て 0 を返す (比較ツールで差分 0 として扱うためのフォールバック)。
 */
export function computeNumericStats(values: readonly number[]): NumericStats {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / sorted.length;

  const mid = Math.floor(sorted.length / EVEN_ODD_MODULUS);
  const median =
    sorted.length % EVEN_ODD_MODULUS === 1
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / MEDIAN_AVERAGE_DIVISOR;

  return { min, max, mean, median };
}

/**
 * 種族値 6 つの合計 (BST, base stats total)。
 */
export function baseStatsTotal(stats: BaseStats): number {
  return (
    stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe
  );
}
