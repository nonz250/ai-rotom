import { Field } from "@smogon/calc";
import type { ConditionsInput } from "../types.js";

/**
 * ConditionsInput から @smogon/calc の Field オブジェクトを組み立てる。
 * conditions が undefined の場合は空の Field を返す。
 */
export function buildField(conditions: ConditionsInput | undefined): Field {
  if (conditions === undefined) {
    return new Field();
  }

  return new Field({
    weather: conditions.weather as "Sun" | "Rain" | "Sand" | "Hail" | "Snow" | undefined,
    terrain: conditions.terrain as "Electric" | "Grassy" | "Misty" | "Psychic" | undefined,
    defenderSide: {
      isReflect: conditions.isReflect ?? false,
      isLightScreen: conditions.isLightScreen ?? false,
      isAuroraVeil: conditions.isAuroraVeil ?? false,
    },
  });
}
