import { describe, it, expect } from "vitest";
import { naturesById, toDataId } from "../../data-store";
import { natureNameResolver } from "../../name-resolvers";

describe("get_nature_info logic", () => {
  describe("データ取得", () => {
    it("英語名から性格データが取得できる", () => {
      const entry = naturesById.get(toDataId("Modest"));
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Modest");
      expect(entry!.nameJa).toBe("ひかえめ");
      expect(entry!.plus).toBe("spa");
      expect(entry!.minus).toBe("atk");
    });

    it("日本語名から英語名に解決できる", () => {
      const englishName = natureNameResolver.toEnglish("いじっぱり");
      expect(englishName).toBe("Adamant");

      const entry = naturesById.get(toDataId(englishName!));
      expect(entry).toBeDefined();
      expect(entry!.plus).toBe("atk");
      expect(entry!.minus).toBe("spa");
    });

    it("無補正性格は plus/minus が null になる", () => {
      const entry = naturesById.get(toDataId("Serious"));
      expect(entry).toBeDefined();
      expect(entry!.plus).toBeNull();
      expect(entry!.minus).toBeNull();
    });

    it("ようきは spe+ / spa- を持つ", () => {
      const entry = naturesById.get(toDataId("Jolly"));
      expect(entry).toBeDefined();
      expect(entry!.plus).toBe("spe");
      expect(entry!.minus).toBe("spa");
    });
  });

  describe("存在しない性格", () => {
    it("toEnglish で存在しない日本語名は undefined を返す", () => {
      const result = natureNameResolver.toEnglish("ない性格");
      expect(result).toBeUndefined();
    });

    it("toDataId で存在しない ID は Map に無い", () => {
      const entry = naturesById.get(toDataId("NoSuchNature"));
      expect(entry).toBeUndefined();
    });
  });
});
