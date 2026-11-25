import { describe, it, expect } from "vitest";
import { NameResolver } from "./name-resolver";
import { MAX_NAME_LENGTH } from "../schemas/party";
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

    it("正規化後の長さが名前の最大文字数ちょうどの入力には候補を返す", () => {
      const atLimit = "あ".repeat(MAX_NAME_LENGTH);
      const longNameResolver = new NameResolver([{ ja: atLimit, en: "AtLimit" }]);
      expect(longNameResolver.suggestSimilar(atLimit)).toEqual([atLimit]);
    });

    it("正規化後の長さが名前の最大文字数を超える入力には候補を返さない", () => {
      const overLimit = "あ".repeat(MAX_NAME_LENGTH + 1);
      const longNameResolver = new NameResolver([{ ja: overLimit, en: "OverLimit" }]);
      expect(longNameResolver.suggestSimilar(overLimit)).toEqual([]);
    });

    it("正規化で最大文字数を超える入力には、正規化前が最大文字数以内でも候補を返さない", () => {
      const expandingChar = "㍿";
      const expandedLength = expandingChar.normalize("NFKC").length;
      const input = expandingChar.repeat(Math.ceil((MAX_NAME_LENGTH + 1) / expandedLength));
      const normalized = input.normalize("NFKC");
      const expandingResolver = new NameResolver([{ ja: normalized, en: "Expanded" }]);
      expect(input.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
      expect(expandingResolver.suggestSimilar(input)).toEqual([]);
    });
  });

  describe("size", () => {
    it("should return the number of entries", () => {
      expect(resolver.size).toBe(TEST_ENTRIES.length);
    });
  });
});

describe("NameResolver 全角・半角の表記ゆれ", () => {
  const resolver = new NameResolver([
    { ja: "１０まんボルト", en: "Thunderbolt" },
    { ja: "リザードナイトＸ", en: "Charizardite X" },
    { ja: "メガリザードンX", en: "Charizard-Mega-X" },
    { ja: "ガブリアス", en: "Garchomp" },
  ]);

  it("データが全角英数字でも半角英数字の入力で引ける", () => {
    expect(resolver.toEnglish("10まんボルト")).toBe("Thunderbolt");
    expect(resolver.toEnglish("リザードナイトX")).toBe("Charizardite X");
    expect(resolver.hasJapaneseName("10まんボルト")).toBe(true);
  });

  it("データが半角英数字でも全角英数字の入力で引ける", () => {
    expect(resolver.toEnglish("メガリザードンＸ")).toBe("Charizard-Mega-X");
  });

  it("半角カタカナの入力でも引ける", () => {
    expect(resolver.toEnglish("ｶﾞﾌﾞﾘｱｽ")).toBe("Garchomp");
  });

  it("英語名から引いた日本語名はデータの表記のまま返す", () => {
    expect(resolver.toJapanese("Thunderbolt")).toBe("１０まんボルト");
  });

  it("類似候補は入力の表記ゆれを吸収して探す", () => {
    expect(resolver.suggestSimilar("10まんボル")).toContain("１０まんボルト");
  });
});
