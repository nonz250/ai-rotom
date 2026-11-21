import type { DamageCalcResult } from "../types.js";

/**
 * 複数の技を並べて比較するときの 1 技分の要約。
 * 乱数配列や説明文は技数ぶん積み上がると出力を大きく膨らませるため含めない。
 * 1 技の詳細が必要なら単発のダメ計を使う。
 */
export interface MoveDamageSummary {
  move: string;
  moveJa: string;
  moveType: string;
  isStab: boolean;
  typeMultiplier: number;
  minPercent: number;
  maxPercent: number;
  koChance: string;
}

export function summarizeMoveDamage(
  result: DamageCalcResult,
  toJapanese: (moveName: string) => string | undefined,
): MoveDamageSummary {
  return {
    move: result.move,
    moveJa: toJapanese(result.move) ?? result.move,
    moveType: result.moveType,
    isStab: result.isStab,
    typeMultiplier: result.typeMultiplier,
    minPercent: result.minPercent,
    maxPercent: result.maxPercent,
    koChance: result.koChance,
  };
}
