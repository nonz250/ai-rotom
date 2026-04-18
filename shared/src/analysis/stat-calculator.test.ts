import { describe, it, expect } from "vitest";
import { calculateStatValue } from "./stat-calculator";
import type { StatId } from "./stat-calculator";

/**
 * ガブリアスの種族値（Lv50 実数値計算で使用するテストデータ）
 * base HP=108, Atk=130, Def=95, SpA=80, SpD=85, Spe=102
 */
const GARCHOMP_BASE_HP = 108;
const GARCHOMP_BASE_ATK = 130;
const GARCHOMP_BASE_SPE = 102;

describe("calculateStatValue", () => {
  describe("HP", () => {
    it("ガブリアス (base 108, SP 0) の HP は 183", () => {
      // floor((108*2+31)*50/100) + 50 + 10 = 123 + 60 = 183
      const GARCHOMP_HP_NO_SP = 183;
      expect(
        calculateStatValue("hp", GARCHOMP_BASE_HP, 0, null, null),
      ).toBe(GARCHOMP_HP_NO_SP);
    });

    it("HP は SP をそのまま加算する (1 SP = +1)", () => {
      // 183 + 10 = 193
      const EXPECTED = 193;
      expect(
        calculateStatValue("hp", GARCHOMP_BASE_HP, 10, null, null),
      ).toBe(EXPECTED);
    });

    it("HP は性格補正の影響を受けない", () => {
      const withNeutral = calculateStatValue(
        "hp",
        GARCHOMP_BASE_HP,
        0,
        null,
        null,
      );
      // HP に対する上昇/下降性格は存在しないが、仮に指定されても無視される
      const withIrrelevantNature = calculateStatValue(
        "hp",
        GARCHOMP_BASE_HP,
        0,
        "atk",
        "spa",
      );
      expect(withIrrelevantNature).toBe(withNeutral);
    });
  });

  describe("素早さ", () => {
    it("ガブリアス (base 102, SP 0, 無補正) の素早さは 122", () => {
      // floor((102*2+31)*50/100) + 5 = 117 + 5 = 122
      const GARCHOMP_SPE_NO_SP = 122;
      expect(
        calculateStatValue("spe", GARCHOMP_BASE_SPE, 0, null, null),
      ).toBe(GARCHOMP_SPE_NO_SP);
    });

    it("ガブリアス (base 102, SP 32, 上昇補正) の素早さは 169", () => {
      // floor((117 + 5 + 32) * 1.1) = floor(169.4) = 169
      const GARCHOMP_SPE_JOLLY_MAX = 169;
      expect(
        calculateStatValue("spe", GARCHOMP_BASE_SPE, 32, "spe", null),
      ).toBe(GARCHOMP_SPE_JOLLY_MAX);
    });

    it("下降補正は 0.9 倍される", () => {
      // floor((117 + 5 + 0) * 0.9) = floor(109.8) = 109
      const EXPECTED_MINUS = 109;
      expect(
        calculateStatValue("spe", GARCHOMP_BASE_SPE, 0, null, "spe"),
      ).toBe(EXPECTED_MINUS);
    });
  });

  describe("攻撃", () => {
    it("ガブリアス (base 130, SP 0, 無補正) の攻撃は 150", () => {
      // floor((130*2+31)*50/100) + 5 = 145 + 5 = 150
      const GARCHOMP_ATK_NO_SP = 150;
      expect(
        calculateStatValue("atk", GARCHOMP_BASE_ATK, 0, null, null),
      ).toBe(GARCHOMP_ATK_NO_SP);
    });

    it("ガブリアス (base 130, SP 32, 上昇補正) の攻撃は 200", () => {
      // floor((145 + 5 + 32) * 1.1) = floor(200.2) = 200
      const GARCHOMP_ATK_ADAMANT_MAX = 200;
      expect(
        calculateStatValue("atk", GARCHOMP_BASE_ATK, 32, "atk", null),
      ).toBe(GARCHOMP_ATK_ADAMANT_MAX);
    });

    it("上昇/下降が別のステなら対象ステは無補正", () => {
      // naturePlus=spa, natureMinus=spd の場合、atk にはどちらの補正も掛からず 1.0 倍
      const EXPECTED = 150;
      expect(
        calculateStatValue("atk", GARCHOMP_BASE_ATK, 0, "spa", "spd"),
      ).toBe(EXPECTED);
    });
  });

  describe("丸め（floor）", () => {
    it.each<[StatId, number, number, StatId | null]>([
      ["atk", 130, 32, "atk"],
      ["spa", 80, 16, "spa"],
      ["def", 95, 4, null],
      ["spd", 85, 8, "spd"],
    ])(
      "%s (base=%i, sp=%i) の結果は整数になる",
      (stat, base, sp, plus) => {
        const result = calculateStatValue(stat, base, sp, plus, null);
        expect(Number.isInteger(result)).toBe(true);
      },
    );
  });
});
