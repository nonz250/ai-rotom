import { Field } from "@smogon/calc";
import type { GameType } from "@smogon/calc/dist/data/interface";
import type { ConditionsInput } from "../types.js";

/**
 * battleFormat を @smogon/calc の GameType に変換する。
 * 未指定 / "singles" は "Singles"、"doubles" は "Doubles"。
 */
function toGameType(
  battleFormat: ConditionsInput["battleFormat"],
): GameType {
  return battleFormat === "doubles" ? "Doubles" : "Singles";
}

/**
 * ConditionsInput から @smogon/calc の Field オブジェクトを組み立てる。
 * conditions が undefined の場合は gameType=Singles の空の Field を返す。
 *
 * gameType="Doubles" 指定時は @smogon/calc が以下のダブル補正を自動で適用する:
 * - 全体攻撃技 (target: allAdjacent / allAdjacentFoes) の威力 ×0.75
 * - リフレクター/ひかりのかべ/オーロラベールの軽減率が 0.5 → 約 0.667 倍
 */
export function buildField(conditions: ConditionsInput | undefined): Field {
  if (conditions === undefined) {
    return new Field({ gameType: "Singles" });
  }

  return new Field({
    gameType: toGameType(conditions.battleFormat),
    weather: conditions.weather as "Sun" | "Rain" | "Sand" | "Hail" | "Snow" | undefined,
    terrain: conditions.terrain as "Electric" | "Grassy" | "Misty" | "Psychic" | undefined,
    defenderSide: {
      isReflect: conditions.isReflect ?? false,
      isLightScreen: conditions.isLightScreen ?? false,
      isAuroraVeil: conditions.isAuroraVeil ?? false,
    },
  });
}
