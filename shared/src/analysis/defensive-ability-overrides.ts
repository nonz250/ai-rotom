import type { TypeName } from "@smogon/calc/dist/data/interface";

/**
 * 防御側の特性・もちものに応じて、タイプ相性倍率を補正するための入力。
 *
 * ability / item は英語名（@smogon/calc 互換の "Levitate" / "Ring Target" 等）
 * または ID（"levitate" / "ringtarget" 等）を受け付ける。呼び出し側で事前に
 * 正規化して渡すこと。未知の値はそのまま無視する。
 */
export interface DefensiveContextOverrides {
  ability?: string;
  item?: string;
}

/** 等倍 */
const NEUTRAL_MULTIPLIER = 1;

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

/** リングターゲット: 特性・タイプによる無効化を解除する */
const RING_TARGET_ITEM_ID = "ringtarget";

/** くろいてっきゅう: じめん技の無効化を解除する（タイプ・特性の両方） */
const IRON_BALL_ITEM_ID = "ironball";

/**
 * 特性・もちものを加味したタイプ相性補正を適用する。
 *
 * 優先順位:
 *   1. もちもの（リングターゲット / くろいてっきゅう）による無効解除
 *      → 特性の無効化・タイプによる 0 倍化の両方をキャンセルする
 *   2. 特性による無効化（もちもので解除されていない場合）
 *   3. フィルター系の 0.75 倍（抜群時のみ）
 *
 * @param baseMultiplier 純粋なタイプ相性計算の結果
 * @param attackingType 攻撃側の技タイプ
 * @param context 防御側の ability / item（英語名 or ID）
 * @returns 補正後の倍率
 */
export function applyDefensiveOverrides(
  baseMultiplier: number,
  attackingType: TypeName,
  context: DefensiveContextOverrides,
): number {
  const abilityId =
    context.ability !== undefined ? toId(context.ability) : undefined;
  const itemId = context.item !== undefined ? toId(context.item) : undefined;

  const hasRingTarget = itemId === RING_TARGET_ITEM_ID;
  const hasIronBall = itemId === IRON_BALL_ITEM_ID;

  let multiplier = baseMultiplier;

  // もちものによる「タイプ由来の 0 倍化」解除。
  // - リングターゲット: あらゆるタイプ無効を等倍に戻す
  // - くろいてっきゅう: じめん技の無効（ひこう / ふゆう等の合成結果）を等倍に戻す
  if (multiplier === IMMUNE_MULTIPLIER) {
    if (hasRingTarget) {
      multiplier = NEUTRAL_MULTIPLIER;
    } else if (hasIronBall && attackingType === "Ground") {
      multiplier = NEUTRAL_MULTIPLIER;
    }
  }

  // 特性による無効化判定。
  // リングターゲット所持時、または くろいてっきゅう 所持時の じめん技 は特性を上書きしない。
  const ignoreAbilityImmunity =
    hasRingTarget || (hasIronBall && attackingType === "Ground");
  if (abilityId !== undefined && !ignoreAbilityImmunity) {
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
