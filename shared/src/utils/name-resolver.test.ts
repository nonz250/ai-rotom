import { describe, it, expect } from "vitest";
import { NameResolver } from "./name-resolver";
import type { NameEntry } from "./name-resolver";

const TEST_ENTRIES: NameEntry[] = [
  { ja: "リザードン", en: "Charizard" },
  { ja: "ギャラドス", en: "Gyarados" },
  { ja: "ガブリアス", en: "Garchomp" },
  { ja: "メガリザードンX", en: "Charizard-Mega-X" },
  { ja: "かえんほうしゃ", en: "Flamethrower" },
];

describe("NameResolver", () => {
  const resolver = new NameResolver(TEST_ENTRIES);

  describe("toEnglish", () => {
    it("should convert Japanese name to English", () => {
      expect(resolver.toEnglish("リザードン")).toBe("Charizard");
      expect(resolver.toEnglish("かえんほうしゃ")).toBe("Flamethrower");
    });

    it("should return undefined for unknown name", () => {
      expect(resolver.toEnglish("ピカチュウ")).toBeUndefined();
    });
  });

  describe("toJapanese", () => {
    it("should convert English name to Japanese", () => {
      expect(resolver.toJapanese("Charizard")).toBe("リザードン");
      expect(resolver.toJapanese("Flamethrower")).toBe("かえんほうしゃ");
    });

    it("should return undefined for unknown name", () => {
      expect(resolver.toJapanese("Pikachu")).toBeUndefined();
    });
  });

  describe("hasJapaneseName / hasEnglishName", () => {
    it("should return true for existing names", () => {
      expect(resolver.hasJapaneseName("リザードン")).toBe(true);
      expect(resolver.hasEnglishName("Charizard")).toBe(true);
    });

    it("should return false for non-existing names", () => {
      expect(resolver.hasJapaneseName("ピカチュウ")).toBe(false);
      expect(resolver.hasEnglishName("Pikachu")).toBe(false);
    });
  });

  describe("suggestSimilar", () => {
    it("should suggest similar names for typos", () => {
      const suggestions = resolver.suggestSimilar("リザードソ");
      expect(suggestions).toContain("リザードン");
    });

    it("should return empty for completely different input", () => {
      const suggestions = resolver.suggestSimilar("あいうえおかきくけこさしすせそ");
      expect(suggestions).toHaveLength(0);
    });
  });

  describe("size", () => {
    it("should return the number of entries", () => {
      expect(resolver.size).toBe(TEST_ENTRIES.length);
    });
  });
});
