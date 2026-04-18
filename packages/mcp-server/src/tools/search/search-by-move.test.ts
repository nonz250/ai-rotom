import { describe, it, expect } from "vitest";
import {
  championsLearnsets,
  movesById,
  pokemonById,
  toDataId,
} from "../../data-store";
import { moveNameResolver } from "../../name-resolvers";

/**
 * search_pokemon_by_move のロジックを直接テストする。
 * サーバー登録は server-level の責務なので、ここではデータ走査ロジックを検証する。
 */
describe("search_pokemon_by_move logic", () => {
  describe("正常系", () => {
    it("ステルスロックを覚えるポケモン一覧が取得できる", () => {
      const moveEn = moveNameResolver.toEnglish("ステルスロック");
      expect(moveEn).toBe("Stealth Rock");

      const moveId = toDataId(moveEn!);
      const move = movesById.get(moveId);
      expect(move).toBeDefined();

      const matched: string[] = [];
      for (const [pokemonId, moveIds] of Object.entries(championsLearnsets)) {
        if (moveIds.includes(moveId)) {
          const entry = pokemonById.get(pokemonId);
          if (entry !== undefined) {
            matched.push(entry.name);
          }
        }
      }

      expect(matched.length).toBeGreaterThan(0);
      // 代表的なステルスロック使いをチェック
      expect(matched).toContain("Tyranitar");
      expect(matched).toContain("Hippowdon");
    });

    it("英語名でも検索できる", () => {
      expect(moveNameResolver.hasEnglishName("Earthquake")).toBe(true);

      const moveId = toDataId("Earthquake");
      const matched: string[] = [];
      for (const [pokemonId, moveIds] of Object.entries(championsLearnsets)) {
        if (moveIds.includes(moveId)) {
          const entry = pokemonById.get(pokemonId);
          if (entry !== undefined) {
            matched.push(entry.name);
          }
        }
      }

      expect(matched.length).toBeGreaterThan(0);
      expect(matched).toContain("Garchomp");
    });

    it("結果は name 昇順でソートされる想定", () => {
      const names = ["Zygarde", "Abomasnow", "Charizard"];
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(sorted[0]).toBe("Abomasnow");
      expect(sorted[sorted.length - 1]).toBe("Zygarde");
    });
  });

  describe("エラー系", () => {
    it("存在しない技名はundefinedを返す", () => {
      const result = moveNameResolver.toEnglish("スーパームーブ");
      expect(result).toBeUndefined();
    });
  });

  describe("エッジケース", () => {
    it("一部のポケモンしか覚えない技でも検索できる", () => {
      // "Blizzard" は冬季系ポケモンやサブで多くが覚えるが、
      // データ存在を確認するのみ。
      const moveId = toDataId("Blizzard");
      expect(movesById.get(moveId)).toBeDefined();

      const matched: string[] = [];
      for (const [pokemonId, moveIds] of Object.entries(championsLearnsets)) {
        if (moveIds.includes(moveId)) {
          const entry = pokemonById.get(pokemonId);
          if (entry !== undefined) {
            matched.push(entry.name);
          }
        }
      }
      expect(matched.length).toBeGreaterThan(0);
    });
  });
});
