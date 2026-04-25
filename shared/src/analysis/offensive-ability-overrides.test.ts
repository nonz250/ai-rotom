import { describe, it, expect } from "vitest";
import {
  applyOffensiveTypeOverride,
  OFFENSIVE_TYPE_OVERRIDES,
} from "./offensive-ability-overrides";

describe("applyOffensiveTypeOverride", () => {
  describe("タイプ変更系特性 × ノーマル技", () => {
    it("pixilate + ノーマル物理技 → Fairy", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Physical", "pixilate"),
      ).toBe("Fairy");
    });

    it("pixilate + ノーマル特殊技 → Fairy", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Special", "pixilate"),
      ).toBe("Fairy");
    });

    it("galvanize + ノーマル技 → Electric", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Physical", "galvanize"),
      ).toBe("Electric");
    });

    it("refrigerate + ノーマル技 → Ice", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Physical", "refrigerate"),
      ).toBe("Ice");
    });

    it("aerilate + ノーマル技 → Flying", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Physical", "aerilate"),
      ).toBe("Flying");
    });

    it("英語名（先頭大文字）でも正規化されて変換される (Pixilate)", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Physical", "Pixilate"),
      ).toBe("Fairy");
    });

    it("ハイフン・空白混じりでも正規化で通る ('  Pix-ilate ')", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Physical", "  Pix-ilate "),
      ).toBe("Fairy");
    });
  });

  describe("変換されないケース", () => {
    it("特性 undefined → 原型", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Physical", undefined),
      ).toBe("Normal");
    });

    it("非ノーマル技は特性があっても変換されない (pixilate + じしん)", () => {
      expect(
        applyOffensiveTypeOverride("Ground", "Physical", "pixilate"),
      ).toBe("Ground");
    });

    it("ノーマルの Status 技は変換されない (pixilate + すてみタックル相当の変化技)", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Status", "pixilate"),
      ).toBe("Normal");
    });

    it("未知の特性は変換されない (silent fallback)", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Physical", "unknownability"),
      ).toBe("Normal");
    });

    it("非変換系の既知特性は変換されない (intimidate 等)", () => {
      expect(
        applyOffensiveTypeOverride("Normal", "Physical", "intimidate"),
      ).toBe("Normal");
    });
  });

  describe("OFFENSIVE_TYPE_OVERRIDES のエクスポート", () => {
    it("4 特性すべてがマップに含まれる", () => {
      const EXPECTED_ENTRIES = 4;
      expect(OFFENSIVE_TYPE_OVERRIDES.size).toBe(EXPECTED_ENTRIES);
      expect(OFFENSIVE_TYPE_OVERRIDES.get("pixilate")).toBe("Fairy");
      expect(OFFENSIVE_TYPE_OVERRIDES.get("galvanize")).toBe("Electric");
      expect(OFFENSIVE_TYPE_OVERRIDES.get("refrigerate")).toBe("Ice");
      expect(OFFENSIVE_TYPE_OVERRIDES.get("aerilate")).toBe("Flying");
    });
  });
});
