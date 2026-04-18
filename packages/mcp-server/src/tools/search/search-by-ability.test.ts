import { describe, it, expect } from "vitest";
import {
  abilitiesById,
  championsPokemon,
  toDataId,
} from "../../data-store";
import { abilityNameResolver } from "../../name-resolvers";

describe("search_pokemon_by_ability logic", () => {
  describe("正常系", () => {
    it("いかくを持つポケモン一覧が取得できる", () => {
      const abilityEn = abilityNameResolver.toEnglish("いかく");
      expect(abilityEn).toBe("Intimidate");

      const entry = abilitiesById.get(toDataId(abilityEn!));
      expect(entry).toBeDefined();

      const matched = championsPokemon.filter((p) =>
        p.abilities.includes(entry!.name),
      );
      expect(matched.length).toBeGreaterThan(0);

      const names = matched.map((p) => p.name);
      // いかくの代表的な持ち主
      expect(names).toContain("Arbok");
      expect(names).toContain("Arcanine");
      expect(names).toContain("Incineroar");
    });

    it("英語名でも検索できる", () => {
      expect(abilityNameResolver.hasEnglishName("Blaze")).toBe(true);

      const entry = abilitiesById.get(toDataId("Blaze"));
      expect(entry).toBeDefined();

      const matched = championsPokemon.filter((p) =>
        p.abilities.includes(entry!.name),
      );
      // Blaze はほのおの御三家の通常特性
      expect(matched.length).toBeGreaterThan(0);
      const names = matched.map((p) => p.name);
      expect(names).toContain("Charizard");
    });

    it("hugepower(ちからもち)等のレアな特性も引ける", () => {
      const entry = abilitiesById.get(toDataId("Huge Power"));
      expect(entry).toBeDefined();

      const matched = championsPokemon.filter((p) =>
        p.abilities.includes(entry!.name),
      );
      expect(matched.length).toBeGreaterThan(0);
    });
  });

  describe("エラー系", () => {
    it("存在しない特性名はundefinedを返す", () => {
      const result = abilityNameResolver.toEnglish("スーパーパワー特性");
      expect(result).toBeUndefined();
    });
  });

  describe("エッジケース", () => {
    it("ソート結果は昇順になる", () => {
      const names = ["Zebstrika", "Arbok", "Mudsdale"];
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(sorted[0]).toBe("Arbok");
    });
  });
});
