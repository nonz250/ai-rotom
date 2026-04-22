import type { DamageCalcResult } from "../types.js";

/**
 * calculateAllMoves の結果を learnset で絞り込む。
 *
 * @smogon/calc は全技を走査するため、実際に覚えない技で過大評価しないように
 * 呼び出し側で learnset フィルタを適用するための純関数。
 *
 * learnsetMoveIds が空集合の場合は、learnset データが無い（不明）とみなして
 * フィルタせず元の配列をそのまま返す（現行挙動踏襲）。
 *
 * 呼び出し側は `results[i].move` と `learnsetMoveIds` を同じ正規化形式で
 * 揃える責務を持つ。正規化ロジックは `normalize` 引数で注入する。
 */
export function filterResultsByLearnset(
  results: readonly DamageCalcResult[],
  learnsetMoveIds: ReadonlySet<string>,
  normalize: (moveName: string) => string,
): DamageCalcResult[] {
  if (learnsetMoveIds.size === 0) {
    return [...results];
  }
  return results.filter((r) => learnsetMoveIds.has(normalize(r.move)));
}
