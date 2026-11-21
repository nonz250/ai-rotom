import { describe, it, expect } from "vitest";
import type { DamageCalcResult } from "../types.js";
import { summarizeMoveDamage } from "./move-damage-summary.js";

const RESULT: DamageCalcResult = {
  attacker: "Garchomp",
  defender: "Gholdengo",
  move: "Earthquake",
  damage: [100, 102, 104],
  min: 100,
  max: 104,
  minPercent: 60.2,
  maxPercent: 62.6,
  koChance: "guaranteed 2HKO",
  description: "0 Atk Garchomp Earthquake vs. 0 HP / 0 Def Gholdengo: 100-104 (60.2 - 62.6%) -- guaranteed 2HKO",
  moveType: "Ground",
  typeMultiplier: 2,
  isStab: true,
  effectivePowerMultiplier: 3,
};

describe("summarizeMoveDamage", () => {
  it("技ごとの比較に必要な項目だけを残す", () => {
    expect(summarizeMoveDamage(RESULT, () => "じしん")).toEqual({
      move: "Earthquake",
      moveJa: "じしん",
      moveType: "Ground",
      isStab: true,
      typeMultiplier: 2,
      minPercent: 60.2,
      maxPercent: 62.6,
      koChance: "guaranteed 2HKO",
    });
  });

  it("日本語名が引けない技は英語名で代用する", () => {
    expect(summarizeMoveDamage(RESULT, () => undefined).moveJa).toBe("Earthquake");
  });
});
