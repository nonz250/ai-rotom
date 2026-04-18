import { describe, it, expect } from "vitest";
import {
  championsLearnsets,
  movesById,
  toDataId,
} from "../../data-store";
import {
  moveNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers";

describe("get_learnset logic", () => {
  describe("データ取得", () => {
    it("英語名で learnset が取得できる", () => {
      const charizardId = toDataId("Charizard");
      const moveIds = championsLearnsets[charizardId];
      expect(moveIds).toBeDefined();
      expect(moveIds.length).toBeGreaterThan(0);
    });

    it("日本語名→英語名→learnset の経路で取得できる", () => {
      const englishName = pokemonNameResolver.toEnglish("リザードン");
      expect(englishName).toBe("Charizard");

      const moveIds = championsLearnsets[toDataId(englishName!)];
      expect(moveIds).toBeDefined();
      expect(moveIds.length).toBeGreaterThan(0);
    });

    it("learnset 内の各 move ID は movesById に登録されている", () => {
      const moveIds = championsLearnsets[toDataId("Charizard")];
      expect(moveIds).toBeDefined();

      for (const moveId of moveIds) {
        const entry = movesById.get(moveId);
        expect(entry, `moveId=${moveId} not found in movesById`).toBeDefined();
      }
    });

    it("リザードンは「かえんほうしゃ」を覚える", () => {
      const moveIds = championsLearnsets[toDataId("Charizard")];
      const flamethrowerId = toDataId("Flamethrower");
      expect(moveIds).toContain(flamethrowerId);
    });

    it("move ID から英名・日本語名が取得できる", () => {
      const moveId = toDataId("Flamethrower");
      const entry = movesById.get(moveId);
      expect(entry!.name).toBe("Flamethrower");
      expect(moveNameResolver.toJapanese(entry!.name)).toBe("かえんほうしゃ");
    });
  });

  describe("存在しないポケモン", () => {
    it("learnset に存在しない ID は undefined", () => {
      const moveIds = championsLearnsets[toDataId("NoSuchPokemon")];
      expect(moveIds).toBeUndefined();
    });
  });
});
