import { describe, it, expect } from "vitest";
import { movesById, toDataId } from "../../data-store";
import { moveNameResolver } from "../../name-resolvers";

const FLAMETHROWER_BASE_POWER = 90;
const FLAMETHROWER_ACCURACY = 100;
const FLAMETHROWER_PP = 16;

describe("get_move_info logic", () => {
  describe("データ取得", () => {
    it("英語名から技データが取得できる", () => {
      const entry = movesById.get(toDataId("Flamethrower"));
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Flamethrower");
      expect(entry!.type).toBe("Fire");
      expect(entry!.category).toBe("Special");
      expect(entry!.basePower).toBe(FLAMETHROWER_BASE_POWER);
      expect(entry!.accuracy).toBe(FLAMETHROWER_ACCURACY);
      expect(entry!.pp).toBe(FLAMETHROWER_PP);
    });

    it("日本語名から英語名に解決できる", () => {
      const englishName = moveNameResolver.toEnglish("かえんほうしゃ");
      expect(englishName).toBe("Flamethrower");

      const entry = movesById.get(toDataId(englishName!));
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Flamethrower");
    });

    it("英語名から日本語名に逆引きできる", () => {
      const jaName = moveNameResolver.toJapanese("Flamethrower");
      expect(jaName).toBe("かえんほうしゃ");
    });

    it("必中技（accuracy: true）が保持される", () => {
      // 「とける」 (Acid Armor) は変化技で必中
      const entry = movesById.get(toDataId("Acid Armor"));
      expect(entry).toBeDefined();
      expect(entry!.category).toBe("Status");
      expect(entry!.accuracy).toBe(true);
    });
  });

  describe("存在しない技", () => {
    it("toEnglish で存在しない日本語名は undefined を返す", () => {
      const result = moveNameResolver.toEnglish("ないわざ");
      expect(result).toBeUndefined();
    });

    it("toDataId で存在しない ID は Map に無い", () => {
      const entry = movesById.get(toDataId("NoSuchMove"));
      expect(entry).toBeUndefined();
    });
  });

  describe("特殊ケース", () => {
    it("変化技は basePower が 0 のデータ構造になっている", () => {
      const entry = movesById.get(toDataId("Acid Armor"));
      expect(entry!.basePower).toBe(0);
      // 出力変換で null に変える前提
    });

    it("physical 技は basePower が正の値を持つ", () => {
      const entry = movesById.get(toDataId("Accelerock"));
      expect(entry!.category).toBe("Physical");
      expect(entry!.basePower).toBeGreaterThan(0);
    });
  });
});
