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

/** 文字列を ID 相当（英数字のみ・小文字）に正規化する */
function toId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * 特性 ID → 変換後タイプのマップ。
 * キーは `toId` 相当で正規化済みの特性 ID（例: "pixilate"）。
 *
 * `data/champions/abilities.json` の id と一致する。
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
 * ability は英語名（@smogon/calc 互換の "Pixilate" 等）または ID
 * （"pixilate" 等）を受け付ける。内部で `toId` による正規化を行う。
 * 未知の値はそのまま無視する。
 *
 * @param originalMoveType 技本来のタイプ
 * @param moveCategory 技カテゴリ（Status は変換対象外）
 * @param ability 特性名（英語名 or ID、未指定・不明な特性は変換しない）
 */
export function applyOffensiveTypeOverride(
  originalMoveType: TypeName,
  moveCategory: OffensiveMoveCategory,
  ability: string | undefined,
): TypeName {
  if (ability === undefined) {
    return originalMoveType;
  }
  if (originalMoveType !== NORMAL_TYPE) {
    return originalMoveType;
  }
  if (moveCategory === STATUS_CATEGORY) {
    return originalMoveType;
  }
  const abilityId = toId(ability);
  const overrideType = OFFENSIVE_TYPE_OVERRIDES.get(abilityId);
  if (overrideType === undefined) {
    return originalMoveType;
  }
  return overrideType;
}
