/** タイプ相性倍率 (0 / 0.25 / 0.5 / 1 / 2 / 4) を日本語ラベルに変換する。 */
export function typeMultiplierLabel(mult: number): string {
  if (mult === 0) return "無効";
  if (mult === 4) return "4倍弱点";
  if (mult === 2) return "2倍弱点";
  if (mult === 1) return "等倍";
  if (mult === 0.5) return "半減";
  if (mult === 0.25) return "1/4";
  return `${mult}x`;
}
