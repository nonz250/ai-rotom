import type { TypeName } from "@smogon/calc/dist/data/interface";

/**
 * タイプ変更系特性（skin abilities）を扱う純関数モジュール。
 *
 * ノーマル技を別タイプに変換する特性の効果を、カバレッジ計算など
 * 「タイプ相性のみ」を扱うツール向けに反映させる。
 * 威力補正（1.2 倍）はここでは扱わない（ダメージ計算側の責務）。
 */

/** ノーマル技は `move.type === "Normal"` を満たす */
const NORMAL_TYPE: TypeName = "Normal";

/**
 * 変化技のカテゴリ。変化技にはタイプ変更系特性は乗らない。
 * mcp-server 側の MoveCategory と同じ文字列だが、shared は mcp-server に
 * 依存できないためここで独立に定義する。
 */
const STATUS_CATEGORY = "Status" as const;

/** 本モジュールが受け付ける技カテゴリ */
export type OffensiveMoveCategory = "Physical" | "Special" | "Status";

/**
 * 特性 ID → 変換後タイプのマップ。
 * キーは `toID` 相当で正規化済みの特性 ID（例: "pixilate"）。
 *
 * `data/champions/abilities.json` の id と一致する。呼び出し側は
 * 日本語特性名を `abilityNameResolver.toEnglish` → `toDataId` の順で
 * 正規化してから渡す責務を持つ。
 */
export const OFFENSIVE_TYPE_OVERRIDES: ReadonlyMap<string, TypeName> = new Map([
  ["pixilate", "Fairy"],
  ["galvanize", "Electric"],
  ["refrigerate", "Ice"],
  ["aerilate", "Flying"],
]);

/**
 * 攻撃技のタイプに対して、攻撃側の特性によるタイプ変更を適用する。
 *
 * ノーマル技 × タイプ変更系特性の組み合わせのときだけ変換後タイプを返し、
 * それ以外は `originalMoveType` をそのまま返す（regression-free）。
 *
 * @param originalMoveType 技本来のタイプ
 * @param moveCategory 技カテゴリ（Status は変換対象外）
 * @param abilityId 特性 ID（正規化済み、未指定・不明な特性は変換しない）
 */
export function applyOffensiveTypeOverride(
  originalMoveType: TypeName,
  moveCategory: OffensiveMoveCategory,
  abilityId: string | undefined,
): TypeName {
  if (abilityId === undefined) {
    return originalMoveType;
  }
  if (originalMoveType !== NORMAL_TYPE) {
    return originalMoveType;
  }
  if (moveCategory === STATUS_CATEGORY) {
    return originalMoveType;
  }
  const overrideType = OFFENSIVE_TYPE_OVERRIDES.get(abilityId);
  if (overrideType === undefined) {
    return originalMoveType;
  }
  return overrideType;
}
