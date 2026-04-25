import { describe, it, expect } from "vitest";
import type { ConditionsInput } from "../types.js";
import { buildField } from "./field-builder.js";

describe("buildField", () => {
  describe("gameType (battleFormat)", () => {
    it("conditions undefined 時は Singles", () => {
      const field = buildField(undefined);
      expect(field.gameType).toBe("Singles");
    });

    it("battleFormat 未指定時は Singles", () => {
      const field = buildField({});
      expect(field.gameType).toBe("Singles");
    });

    it("battleFormat=\"singles\" は Singles", () => {
      const field = buildField({ battleFormat: "singles" });
      expect(field.gameType).toBe("Singles");
    });

    it("battleFormat=\"doubles\" は Doubles", () => {
      const field = buildField({ battleFormat: "doubles" });
      expect(field.gameType).toBe("Doubles");
    });
  });

  describe("既存フィールド設定との併用", () => {
    it("weather / terrain / battleFormat を同時に指定できる", () => {
      const conditions: ConditionsInput = {
        weather: "Sun",
        terrain: "Electric",
        battleFormat: "doubles",
      };
      const field = buildField(conditions);
      expect(field.gameType).toBe("Doubles");
      expect(field.weather).toBe("Sun");
      expect(field.terrain).toBe("Electric");
    });

    it("doubles 指定時でも壁指定は defenderSide に伝わる", () => {
      const field = buildField({
        battleFormat: "doubles",
        isReflect: true,
        isLightScreen: true,
        isAuroraVeil: false,
      });
      expect(field.gameType).toBe("Doubles");
      expect(field.defenderSide.isReflect).toBe(true);
      expect(field.defenderSide.isLightScreen).toBe(true);
      expect(field.defenderSide.isAuroraVeil).toBe(false);
    });
  });
});
