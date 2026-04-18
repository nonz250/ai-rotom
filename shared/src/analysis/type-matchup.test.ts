import { describe, it, expect } from "vitest";
import { Generations } from "@smogon/calc";
import { calculateTypeEffectiveness } from "./type-matchup";

/** ポケモンチャンピオンズの Generation 番号 */
const CHAMPIONS_GEN_NUM = 0;

describe("calculateTypeEffectiveness", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  describe("単一タイプ", () => {
    it("ほのお vs くさ は 2 倍 (抜群)", () => {
      const SUPER_EFFECTIVE = 2;
      expect(calculateTypeEffectiveness(gen, "Fire", ["Grass"])).toBe(
        SUPER_EFFECTIVE,
      );
    });

    it("みず vs ほのお は 2 倍", () => {
      const SUPER_EFFECTIVE = 2;
      expect(calculateTypeEffectiveness(gen, "Water", ["Fire"])).toBe(
        SUPER_EFFECTIVE,
      );
    });

    it("でんき vs じめん は 0 (無効)", () => {
      const IMMUNE = 0;
      expect(calculateTypeEffectiveness(gen, "Electric", ["Ground"])).toBe(
        IMMUNE,
      );
    });

    it("ノーマル vs ゴースト は 0 (無効)", () => {
      const IMMUNE = 0;
      expect(calculateTypeEffectiveness(gen, "Normal", ["Ghost"])).toBe(IMMUNE);
    });

    it("ほのお vs みず は 0.5 倍 (半減)", () => {
      const RESIST = 0.5;
      expect(calculateTypeEffectiveness(gen, "Fire", ["Water"])).toBe(RESIST);
    });

    it("ノーマル vs ノーマル は 1 倍 (等倍)", () => {
      const NEUTRAL = 1;
      expect(calculateTypeEffectiveness(gen, "Normal", ["Normal"])).toBe(
        NEUTRAL,
      );
    });
  });

  describe("複合タイプ（2 タイプ）", () => {
    it("ほのお vs くさ/むし は 4 倍 (2×2)", () => {
      const DOUBLE_WEAK = 4;
      expect(
        calculateTypeEffectiveness(gen, "Fire", ["Grass", "Bug"]),
      ).toBe(DOUBLE_WEAK);
    });

    it("みず vs ほのお/じめん は 4 倍", () => {
      const DOUBLE_WEAK = 4;
      expect(
        calculateTypeEffectiveness(gen, "Water", ["Fire", "Ground"]),
      ).toBe(DOUBLE_WEAK);
    });

    it("ほのお vs みず/いわ は 0.25 倍 (0.5×0.5)", () => {
      const DOUBLE_RESIST = 0.25;
      expect(
        calculateTypeEffectiveness(gen, "Fire", ["Water", "Rock"]),
      ).toBe(DOUBLE_RESIST);
    });

    it("かくとう vs ノーマル/ゴースト は 0 (抜群と無効の積)", () => {
      // かくとう vs ノーマル = 2, かくとう vs ゴースト = 0 → 2 * 0 = 0
      const IMMUNE = 0;
      expect(
        calculateTypeEffectiveness(gen, "Fighting", ["Normal", "Ghost"]),
      ).toBe(IMMUNE);
    });

    it("ひこう vs くさ/でんき は 1 倍 (2×0.5)", () => {
      // ひこう vs くさ = 2, ひこう vs でんき = 0.5 → 1
      const NEUTRAL = 1;
      expect(
        calculateTypeEffectiveness(gen, "Flying", ["Grass", "Electric"]),
      ).toBe(NEUTRAL);
    });
  });

  describe("引数順の独立性", () => {
    it("2 タイプの順序が違っても結果は同じ（乗算の可換性）", () => {
      const a = calculateTypeEffectiveness(gen, "Fire", ["Grass", "Bug"]);
      const b = calculateTypeEffectiveness(gen, "Fire", ["Bug", "Grass"]);
      expect(a).toBe(b);
    });
  });

  describe("空配列", () => {
    it("防御タイプが空配列なら 1 (等倍)", () => {
      const NEUTRAL = 1;
      expect(calculateTypeEffectiveness(gen, "Fire", [])).toBe(NEUTRAL);
    });
  });
});
