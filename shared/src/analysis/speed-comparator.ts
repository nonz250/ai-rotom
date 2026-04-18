/** 2 体の素早さ実数値を比較した結果 */
export type SpeedComparison = "faster" | "slower" | "tie";

/**
 * 2 体の実数値 Speed を比較する。
 *
 * @param a 比較する側（例: 自分のポケモン）の素早さ実数値
 * @param b 比較される側（例: 相手のポケモン）の素早さ実数値
 * @returns `a > b` なら "faster"、`a < b` なら "slower"、等速なら "tie"
 */
export function compareSpeed(a: number, b: number): SpeedComparison {
  if (a > b) {
    return "faster";
  }
  if (a < b) {
    return "slower";
  }
  return "tie";
}
