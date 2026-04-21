/** 1ステータスあたりの能力ポイント上限 (Pokemon Champions) */
export const MAX_STAT_POINT_PER_STAT = 32;

/** 全ステータス合計の能力ポイント上限 (Pokemon Champions) */
export const MAX_STAT_POINT_TOTAL = 66;

/** 対戦レベル (Pokemon Champions は 50 固定) */
export const DEFAULT_LEVEL = 50;

/** 個体値 (Pokemon Champions は廃止され全ポケモン一律 31 固定) */
export const MAX_IV = 31;

/** 性格補正: 上昇ステ倍率 */
export const NATURE_PLUS_MULTIPLIER = 1.1;

/** 性格補正: 下降ステ倍率 */
export const NATURE_MINUS_MULTIPLIER = 0.9;

/** 性格補正: 無補正倍率 */
export const NATURE_NEUTRAL_MULTIPLIER = 1;

/** タイプ一致 (STAB) 補正倍率。てきおうりょく等の特性補正は含まない通常値 */
export const STAB_MULTIPLIER = 1.5;

/** タイプ不一致時の威力倍率 (STAB なし) */
export const NON_STAB_MULTIPLIER = 1;
