/**
 * ダメージ計算結果の整形ヘルパー。
 * ダメージ配列のフラット化、ダメージ割合（%）計算を提供する。
 */

export const PERCENT_MULTIPLIER = 100;
export const PERCENT_DECIMAL_PRECISION = 10;

/**
 * @smogon/calc の damage は number | number[] | number[][] の可能性があるため、
 * number[] へ正規化する。
 */
export function flattenDamage(damage: number | number[] | number[][]): number[] {
  if (typeof damage === "number") {
    return [damage];
  }
  if (Array.isArray(damage) && damage.length > 0 && Array.isArray(damage[0])) {
    return (damage as number[][]).flat();
  }
  return damage as number[];
}

/**
 * ダメージ実数値を最大HPで割って百分率 (小数点第 1 位まで) に変換する。
 */
export function toPercent(value: number, maxHP: number): number {
  return (
    Math.round(
      (value / maxHP) * PERCENT_MULTIPLIER * PERCENT_DECIMAL_PRECISION,
    ) / PERCENT_DECIMAL_PRECISION
  );
}
