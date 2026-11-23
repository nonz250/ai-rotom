import { describe, it, expect } from "vitest";
import type { DamageCalcResult } from "../types.js";
import { summarizeMoveDamages } from "./move-damage-summary.js";

function result(move: string, maxPercent: number): DamageCalcResult {
  return {
    attacker: "Garchomp",
    defender: "Gholdengo",
    move,
    damage: [100, 102, 104],
    min: 100,
    max: 104,
    minPercent: maxPercent - 2,
    maxPercent,
    koChance: "guaranteed 2HKO",
    description: `Choice Band Garchomp ${move} vs. Gholdengo`,
    moveType: "Ground",
    typeMultiplier: 2,
    isStab: true,
    effectivePowerMultiplier: 3,
  };
}

const SUMMARY_KEYS = [
  "effectivePowerMultiplier",
  "isStab",
  "koChance",
  "maxPercent",
  "minPercent",
  "move",
  "moveJa",
  "moveType",
  "typeMultiplier",
];

describe("summarizeMoveDamages", () => {
  const summaries = summarizeMoveDamages(
    [result("Earthquake", 62.6), result("Outrage", 40.1)],
    (en) => (en === "Earthquake" ? "じしん" : undefined),
  );

  it("最大打点の技にだけ計算条件の説明文を付ける", () => {
    expect(summaries[0].description).toBe("Choice Band Garchomp Earthquake vs. Gholdengo");
    expect(Object.keys(summaries[0]).sort()).toEqual([...SUMMARY_KEYS, "description"].sort());
  });

  it("2 番目以降の技は比較に必要な項目だけを持つ", () => {
    expect(Object.keys(summaries[1]).sort()).toEqual(SUMMARY_KEYS);
  });

  it("日本語名が引けない技は英語名で代用する", () => {
    expect(summaries[0].moveJa).toBe("じしん");
    expect(summaries[1].moveJa).toBe("Outrage");
  });

  it("空の結果は空配列を返す", () => {
    expect(summarizeMoveDamages([], () => undefined)).toEqual([]);
  });
});
