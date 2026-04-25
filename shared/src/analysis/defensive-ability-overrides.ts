import type { TypeName } from "@smogon/calc/dist/data/interface";

/**
 * 防御側の特性に応じて、タイプ相性倍率を補正するための入力。
 *
 * ability は英語名（@smogon/calc 互換の "Levitate" 等）または ID
 * （"levitate" 等）を受け付ける。呼び出し側で事前に正規化して渡すこと。
 * 未知の値はそのまま無視する。
 */
export interface DefensiveContextOverrides {
  ability?: string;
}

/** 無効（0 倍） */
const IMMUNE_MULTIPLIER = 0;

/** フィルター系特性が抜群時に掛ける倍率 (3/4 = 0.75) */
const FILTER_SUPER_EFFECTIVE_MULTIPLIER = 0.75;

/** 効果抜群とみなす最低倍率 */
const SUPER_EFFECTIVE_THRESHOLD = 2;

/** 文字列を ID 相当（英数字のみ・小文字）に正規化する */
function toId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * タイプ相性を無効化する特性 ID → 無効にする攻撃タイプのマップ。
 * ぼうおん（Soundproof）は「おと系技」という技フラグ依存で、タイプ相性では
 * 表現できないためここには含めない（issue スコープ外）。
 */
const TYPE_IMMUNITY_ABILITIES: ReadonlyMap<string, TypeName> = new Map([
  ["levitate", "Ground"],
  ["flashfire", "Fire"],
  ["waterabsorb", "Water"],
  ["voltabsorb", "Electric"],
  ["lightningrod", "Electric"],
  ["motordrive", "Electric"],
  ["stormdrain", "Water"],
  ["sapsipper", "Grass"],
]);

/** 効果抜群時に 0.75 倍にする特性 ID のセット */
const FILTER_LIKE_ABILITIES: ReadonlySet<string> = new Set([
  "filter",
  "solidrock",
  "prismarmor",
]);

/**
 * 特性を加味したタイプ相性補正を適用する。
 *
 * 優先順位:
 *   1. 特性による無効化
 *   2. フィルター系の 0.75 倍（抜群時のみ）
 *
 * @param baseMultiplier 純粋なタイプ相性計算の結果
 * @param attackingType 攻撃側の技タイプ
 * @param context 防御側の ability（英語名 or ID）
 * @returns 補正後の倍率
 */
export function applyDefensiveOverrides(
  baseMultiplier: number,
  attackingType: TypeName,
  context: DefensiveContextOverrides,
): number {
  const abilityId =
    context.ability !== undefined ? toId(context.ability) : undefined;

  let multiplier = baseMultiplier;

  // 特性による無効化判定。
  if (abilityId !== undefined) {
    const immuneType = TYPE_IMMUNITY_ABILITIES.get(abilityId);
    if (immuneType !== undefined && attackingType === immuneType) {
      return IMMUNE_MULTIPLIER;
    }
  }

  // フィルター系の 0.75 倍（抜群時のみ）
  if (
    abilityId !== undefined &&
    FILTER_LIKE_ABILITIES.has(abilityId) &&
    multiplier >= SUPER_EFFECTIVE_THRESHOLD
  ) {
    multiplier *= FILTER_SUPER_EFFECTIVE_MULTIPLIER;
  }

  return multiplier;
}
