import type { Generation, TypeName } from "@smogon/calc/dist/data/interface";

/**
 * タイプ 1 種類に対する相性倍率マップ。
 * @smogon/calc の `Type.effectiveness` と同じ形式。
 */
type TypeEffectivenessMap = Readonly<{
  [type in TypeName]?: number;
}>;

/** 等倍の相性倍率 */
const NEUTRAL_EFFECTIVENESS = 1;

/** `toID` 相当の正規化パターン（英数字以外を除去） */
const TYPE_ID_NORMALIZE_PATTERN = /[^a-z0-9]/g;

/**
 * TypeName を @smogon/calc の `Types.get` が受け付ける ID 文字列に変換する。
 *
 * shared はランタイム依存ゼロ方針のため `toID` を import せず、
 * 同じロジック（lower-case 化と英数字以外の除去）をここで実装する。
 *
 * 戻り値は `Generation["types"]["get"]` の引数型（`ID`）にキャストする。
 */
type TypeLookupId = Parameters<Generation["types"]["get"]>[0];

function toTypeId(typeName: TypeName): TypeLookupId {
  return typeName
    .toLowerCase()
    .replace(TYPE_ID_NORMALIZE_PATTERN, "") as TypeLookupId;
}

/**
 * 攻撃タイプが防御タイプ（単一 or 複合）に与える最終倍率を計算する。
 * 結果は 0 (無効), 0.25, 0.5, 1, 2, 4 のいずれかになる。
 *
 * 各防御タイプに対する倍率を取り、全てを掛け合わせた値を返す。
 * 例: ほのお技 × くさ/むし → 2 × 2 = 4
 * 例: みず技 × ほのお/じめん → 2 × 2 = 4
 * 例: でんき技 × じめん → 0 (無効)
 *
 * @param gen @smogon/calc の Generation（Champions では `Generations.get(0)`）
 * @param attackingType 攻撃側のタイプ名（英名）
 * @param defenderTypes 防御側のタイプ（1 または 2 つ）
 * @returns 複合相性倍率。攻撃タイプが未知の場合は等倍（1）を返し、
 *   未知の防御タイプはその要素を 1 として扱う
 */
export function calculateTypeEffectiveness(
  gen: Generation,
  attackingType: TypeName,
  defenderTypes: readonly TypeName[],
): number {
  const attackType = gen.types.get(toTypeId(attackingType));
  if (attackType === undefined) {
    return NEUTRAL_EFFECTIVENESS;
  }

  const effectivenessMap = attackType.effectiveness as TypeEffectivenessMap;

  let multiplier: number = NEUTRAL_EFFECTIVENESS;
  for (const defenderType of defenderTypes) {
    const value = effectivenessMap[defenderType];
    if (value !== undefined) {
      multiplier *= value;
    }
  }
  return multiplier;
}
