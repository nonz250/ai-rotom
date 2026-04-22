import { describe, it, expect } from "vitest";
import { applyDefensiveOverrides } from "./defensive-ability-overrides";

describe("applyDefensiveOverrides", () => {
  const NEUTRAL = 1;
  const IMMUNE = 0;
  const SUPER_EFFECTIVE = 2;
  const DOUBLE_SUPER_EFFECTIVE = 4;
  const FILTER_SUPER = 1.5;
  const FILTER_DOUBLE_SUPER = 3;
  const RESIST = 0.5;

  describe("特性なし・もちものなし", () => {
    it("素のタイプ相性をそのまま返す", () => {
      expect(applyDefensiveOverrides(SUPER_EFFECTIVE, "Ground", {})).toBe(
        SUPER_EFFECTIVE,
      );
      expect(applyDefensiveOverrides(NEUTRAL, "Fire", {})).toBe(NEUTRAL);
      expect(applyDefensiveOverrides(RESIST, "Water", {})).toBe(RESIST);
    });
  });

  describe("タイプ無効化特性", () => {
    it("ふゆう は じめん を無効にする", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Ground", {
          ability: "Levitate",
        }),
      ).toBe(IMMUNE);
    });

    it("もらいび は ほのお を無効にする", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Fire", {
          ability: "Flash Fire",
        }),
      ).toBe(IMMUNE);
    });

    it("ちくでん は でんき を無効にする", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Electric", {
          ability: "Volt Absorb",
        }),
      ).toBe(IMMUNE);
    });

    it("ちょすい は みず を無効にする", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Water", {
          ability: "Water Absorb",
        }),
      ).toBe(IMMUNE);
    });

    it("そうしょく は くさ を無効にする", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Grass", {
          ability: "Sap Sipper",
        }),
      ).toBe(IMMUNE);
    });

    it("ひらいしん は でんき を無効にする", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Electric", {
          ability: "Lightning Rod",
        }),
      ).toBe(IMMUNE);
    });

    it("よびみず は みず を無効にする", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Water", {
          ability: "Storm Drain",
        }),
      ).toBe(IMMUNE);
    });

    it("でんきエンジン は でんき を無効にする", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Electric", {
          ability: "Motor Drive",
        }),
      ).toBe(IMMUNE);
    });

    it("ID 形式の特性名も受け付ける", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Ground", {
          ability: "levitate",
        }),
      ).toBe(IMMUNE);
    });

    it("対象外のタイプには影響しない（ふゆう + みず技）", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Water", {
          ability: "Levitate",
        }),
      ).toBe(SUPER_EFFECTIVE);
    });
  });

  describe("フィルター系特性", () => {
    it("フィルターは 4 倍弱点を 3 倍に補正する", () => {
      expect(
        applyDefensiveOverrides(DOUBLE_SUPER_EFFECTIVE, "Fighting", {
          ability: "Filter",
        }),
      ).toBe(FILTER_DOUBLE_SUPER);
    });

    it("フィルターは 2 倍弱点を 1.5 倍に補正する", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Ground", {
          ability: "Filter",
        }),
      ).toBe(FILTER_SUPER);
    });

    it("ハードロックも同等に補正する", () => {
      expect(
        applyDefensiveOverrides(DOUBLE_SUPER_EFFECTIVE, "Fighting", {
          ability: "Solid Rock",
        }),
      ).toBe(FILTER_DOUBLE_SUPER);
    });

    it("等倍・半減には影響しない", () => {
      expect(
        applyDefensiveOverrides(NEUTRAL, "Normal", { ability: "Filter" }),
      ).toBe(NEUTRAL);
      expect(
        applyDefensiveOverrides(RESIST, "Fire", { ability: "Filter" }),
      ).toBe(RESIST);
    });
  });

  describe("リングターゲット", () => {
    it("ふゆう特性のじめん無効を解除する", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Ground", {
          ability: "Levitate",
          item: "Ring Target",
        }),
      ).toBe(SUPER_EFFECTIVE);
    });

    it("もらいび特性のほのお無効を解除する", () => {
      expect(
        applyDefensiveOverrides(NEUTRAL, "Fire", {
          ability: "Flash Fire",
          item: "Ring Target",
        }),
      ).toBe(NEUTRAL);
    });

    it("ID 形式のもちもの名も受け付ける", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Ground", {
          ability: "Levitate",
          item: "ringtarget",
        }),
      ).toBe(SUPER_EFFECTIVE);
    });
  });

  describe("くろいてっきゅう", () => {
    it("ひこうタイプのじめん無効 (0 倍) を等倍に戻す", () => {
      expect(
        applyDefensiveOverrides(IMMUNE, "Ground", { item: "Iron Ball" }),
      ).toBe(NEUTRAL);
    });

    it("ふゆう特性のじめん無効も等倍に戻す（base が 0 になっている想定ではなく、特性無効化経路も解除）", () => {
      // ふゆう持ち (飛行タイプではない) の base は通常倍率（2 倍など）で来る
      // くろいてっきゅうは 0 倍を 1 に戻すため、base=2 のまま。
      // さらに特性による 0 倍化を抑止するために ability を無視する挙動も期待したい。
      // ただし本関数は「もちものは特性より優先」で、ここでは ability を単独で適用しても
      // じめん技が通ることを確認する
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Ground", {
          ability: "Levitate",
          item: "Iron Ball",
        }),
      ).toBe(SUPER_EFFECTIVE);
    });

    it("じめん以外には影響しない", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Water", {
          item: "Iron Ball",
        }),
      ).toBe(SUPER_EFFECTIVE);
    });
  });

  describe("未知の名前", () => {
    it("未知の特性名は無視する", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Ground", {
          ability: "UnknownAbility",
        }),
      ).toBe(SUPER_EFFECTIVE);
    });

    it("未知のもちもの名は無視する", () => {
      expect(
        applyDefensiveOverrides(SUPER_EFFECTIVE, "Ground", {
          item: "UnknownItem",
        }),
      ).toBe(SUPER_EFFECTIVE);
    });
  });
});
