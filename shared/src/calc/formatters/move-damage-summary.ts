import type { DamageCalcResult } from "../types.js";

/**
 * 複数の技を並べて比較するときの 1 技分の要約。
 * 乱数配列は技数ぶん積み上がると出力を大きく膨らませるため含めない。
 * 1 技の詳細が必要なら単発のダメ計を使う。
 */
export interface MoveDamageSummary {
  move: string;
  moveJa: string;
  moveType: string;
  isStab: boolean;
  typeMultiplier: number;
  effectivePowerMultiplier: number;
  minPercent: number;
  maxPercent: number;
  koChance: string;
  /** 計算に反映された特性・持ち物・ランク補正などの説明。最大打点の技にだけ付く */
  description?: string;
}

/**
 * ダメージ降順に並んだ計算結果を要約する。
 * 特性や持ち物の補正はどの技にも同じように掛かるため、反映されたかの確認には
 * 最大打点の技の説明文があれば足りる。全技に付けると出力が膨らむので先頭にだけ残す。
 */
export function summarizeMoveDamages(
  results: readonly DamageCalcResult[],
  toJapanese: (moveName: string) => string | undefined,
): MoveDamageSummary[] {
  return results.map((result, index) => {
    const summary: MoveDamageSummary = {
      move: result.move,
      moveJa: toJapanese(result.move) ?? result.move,
      moveType: result.moveType,
      isStab: result.isStab,
      typeMultiplier: result.typeMultiplier,
      effectivePowerMultiplier: result.effectivePowerMultiplier,
      minPercent: result.minPercent,
      maxPercent: result.maxPercent,
      koChance: result.koChance,
    };
    if (index === 0) {
      summary.description = result.description;
    }
    return summary;
  });
}
