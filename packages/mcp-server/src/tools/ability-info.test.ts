import { describe, it, expect } from "vitest";
import { abilitiesById, toDataId } from "../data-store";
import { abilityNameResolver } from "../name-resolvers";

describe("get_ability_info logic", () => {
  describe("データ取得", () => {
    it("英語名から特性データが取得できる", () => {
      const entry = abilitiesById.get(toDataId("Blaze"));
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Blaze");
      expect(entry!.desc.length).toBeGreaterThan(0);
      expect(entry!.shortDesc.length).toBeGreaterThan(0);
    });

    it("日本語名から英語名に解決できる", () => {
      const englishName = abilityNameResolver.toEnglish("もうか");
      expect(englishName).toBe("Blaze");

      const entry = abilitiesById.get(toDataId(englishName!));
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Blaze");
    });

    it("英語名から日本語名に逆引きできる", () => {
      const jaName = abilityNameResolver.toJapanese("Blaze");
      expect(jaName).toBe("もうか");
    });

    it("日本語名からすべてのデータが復元できる", () => {
      const englishName = abilityNameResolver.toEnglish("てきおうりょく");
      expect(englishName).toBe("Adaptability");

      const entry = abilitiesById.get(toDataId(englishName!));
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Adaptability");
    });
  });

  describe("存在しない特性", () => {
    it("toEnglish で存在しない日本語名は undefined を返す", () => {
      const result = abilityNameResolver.toEnglish("ない特性");
      expect(result).toBeUndefined();
    });

    it("toDataId で存在しない ID は Map に無い", () => {
      const entry = abilitiesById.get(toDataId("NoSuchAbility"));
      expect(entry).toBeUndefined();
    });
  });
});
