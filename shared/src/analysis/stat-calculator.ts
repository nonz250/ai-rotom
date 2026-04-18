import {
  DEFAULT_LEVEL,
  MAX_IV,
  NATURE_MINUS_MULTIPLIER,
  NATURE_NEUTRAL_MULTIPLIER,
  NATURE_PLUS_MULTIPLIER,
} from "../constants/champions.js";

/** ポケモンチャンピオンズで扱うステータス ID */
export type StatId = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

/** HP 実数値式の固定加算値（Lv50 時に +10） */
const HP_FIXED_OFFSET = 10;

/** HP 以外の実数値式の固定加算値 */
const NON_HP_FIXED_OFFSET = 5;

/** 種族値に掛ける係数（ゲームの実数値式に由来） */
const BASE_STAT_COEFFICIENT = 2;

/** 実数値式のレベル割り（Lv50 固定） */
const STAT_LEVEL_DIVISOR = 100;

/**
 * 能力ポイント(SP)を含む、種族値 + IV の Lv 補正後中間値を計算する。
 * `floor((baseStat * 2 + MAX_IV) * DEFAULT_LEVEL / 100)` 相当。
 */
function baseStatLevelTerm(baseStat: number): number {
  return Math.floor(
    ((baseStat * BASE_STAT_COEFFICIENT + MAX_IV) * DEFAULT_LEVEL) /
      STAT_LEVEL_DIVISOR,
  );
}

/**
 * 性格補正の倍率を決定する。
 * - `naturePlus === stat` なら NATURE_PLUS_MULTIPLIER (1.1)
 * - `natureMinus === stat` なら NATURE_MINUS_MULTIPLIER (0.9)
 * - それ以外は NATURE_NEUTRAL_MULTIPLIER (1)
 *
 * 無補正性格は `naturePlus === null && natureMinus === null` として渡されることを前提とする。
 */
function resolveNatureMultiplier(
  stat: StatId,
  naturePlus: StatId | null,
  natureMinus: StatId | null,
): number {
  if (naturePlus === stat) {
    return NATURE_PLUS_MULTIPLIER;
  }
  if (natureMinus === stat) {
    return NATURE_MINUS_MULTIPLIER;
  }
  return NATURE_NEUTRAL_MULTIPLIER;
}

/**
 * ポケモンチャンピオンズ仕様での実数値を計算する。
 *
 * ゲーム仕様:
 * - Level: 50 固定
 * - IV: 31 固定（ゲーム側で廃止）
 * - SP: 実数値に直接加算（1 SP = +1）
 * - 性格補正は HP 以外の 5 ステに適用
 *
 * 計算式:
 * - HP: `floor((baseStat * 2 + 31) * 50 / 100) + 50 + 10 + sp`
 * - それ以外: `floor((floor((baseStat * 2 + 31) * 50 / 100) + 5 + sp) * natureMultiplier)`
 *
 * @param stat 計算するステータス
 * @param baseStat 種族値
 * @param sp 能力ポイント（0 〜 MAX_STAT_POINT_PER_STAT=32 を想定）
 * @param naturePlus 性格で 1.1 倍されるステ。無補正性格なら null
 * @param natureMinus 性格で 0.9 倍されるステ。無補正性格なら null
 * @returns 実数値（整数）
 */
export function calculateStatValue(
  stat: StatId,
  baseStat: number,
  sp: number,
  naturePlus: StatId | null,
  natureMinus: StatId | null,
): number {
  const levelTerm = baseStatLevelTerm(baseStat);

  if (stat === "hp") {
    // HP は性格補正の影響を受けない
    return levelTerm + DEFAULT_LEVEL + HP_FIXED_OFFSET + sp;
  }

  const multiplier = resolveNatureMultiplier(stat, naturePlus, natureMinus);
  return Math.floor((levelTerm + NON_HP_FIXED_OFFSET + sp) * multiplier);
}
