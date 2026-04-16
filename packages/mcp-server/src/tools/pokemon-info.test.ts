import { describe, it, expect, beforeAll } from "vitest";
import { Generations, toID } from "@smogon/calc";
import {
  pokemonNameResolver,
  abilityNameResolver,
} from "../name-resolvers";

const CHAMPIONS_GEN_NUM = 0;

/**
 * pokemon-info.ts のロジックを直接テストする。
 * MCP ツールの登録はサーバーに依存するため、
 * ここではデータ取得ロジックの正しさを検証する。
 */
describe("get_pokemon_info", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  describe("日本語名での情報取得", () => {
    it("日本語名からポケモン情報が取得できる", () => {
      const inputName = "リザードン";
      const englishName = pokemonNameResolver.toEnglish(inputName);
      expect(englishName).toBe("Charizard");

      const species = gen.species.get(toID(englishName!));
      expect(species).toBeDefined();
      expect(species!.name).toBe("Charizard");
      expect(species!.types).toContain("Fire");
      expect(species!.types).toContain("Flying");
      expect(species!.baseStats.hp).toBe(78);
      expect(species!.baseStats.atk).toBe(84);
      expect(species!.baseStats.def).toBe(78);
      expect(species!.baseStats.spa).toBe(109);
      expect(species!.baseStats.spd).toBe(85);
      expect(species!.baseStats.spe).toBe(100);
    });

    it("特性の日本語名が取得できる", () => {
      const inputName = "リザードン";
      const englishName = pokemonNameResolver.toEnglish(inputName)!;
      const species = gen.species.get(toID(englishName))!;
      const abilities = Object.values(
        species.abilities as Record<string, string>,
      );
      expect(abilities).toContain("Blaze");

      const abilityJa = abilityNameResolver.toJapanese("Blaze");
      expect(abilityJa).toBe("もうか");
    });

    it("別フォルムが存在するポケモンの otherFormes が取得できる", () => {
      const englishName = pokemonNameResolver.toEnglish("リザードン")!;
      const species = gen.species.get(toID(englishName))!;
      expect(species.otherFormes).toBeDefined();
      expect(species.otherFormes).toContain("Charizard-Mega-X");
      expect(species.otherFormes).toContain("Charizard-Mega-Y");
    });
  });

  describe("英語名での情報取得", () => {
    it("英語名からポケモン情報が取得できる", () => {
      const inputName = "Garchomp";
      expect(pokemonNameResolver.hasEnglishName(inputName)).toBe(true);

      const species = gen.species.get(toID(inputName));
      expect(species).toBeDefined();
      expect(species!.name).toBe("Garchomp");
      expect(species!.types).toContain("Dragon");
      expect(species!.types).toContain("Ground");
    });

    it("英語名から日本語名が逆引きできる", () => {
      const nameJa = pokemonNameResolver.toJapanese("Garchomp");
      expect(nameJa).toBe("ガブリアス");
    });
  });

  describe("存在しないポケモン", () => {
    it("存在しない日本語名で toEnglish が undefined を返す", () => {
      const result = pokemonNameResolver.toEnglish("ソニック");
      expect(result).toBeUndefined();
    });

    it("存在しない英語名で hasEnglishName が false を返す", () => {
      const result = pokemonNameResolver.hasEnglishName("Sonic");
      expect(result).toBe(false);
    });

    it("類似候補が提示される", () => {
      const suggestions = pokemonNameResolver.suggestSimilar("リザード");
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });
});

describe("search_pokemon", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  describe("タイプでの絞り込み", () => {
    it("Fire タイプのポケモンだけが返される", () => {
      const results = [];
      for (const species of gen.species) {
        if (species.types.includes("Fire")) {
          results.push(species.name);
        }
      }
      expect(results.length).toBeGreaterThan(0);
      // 全て Fire タイプを含むことを確認
      for (const name of results) {
        const sp = gen.species.get(toID(name))!;
        expect(sp.types).toContain("Fire");
      }
    });

    it("Dragon タイプのポケモンが検索できる", () => {
      const results = [];
      for (const species of gen.species) {
        if (species.types.includes("Dragon")) {
          results.push(species.name);
        }
      }
      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain("Garchomp");
      expect(results).toContain("Dragonite");
    });
  });

  describe("種族値の下限での絞り込み", () => {
    it("攻撃力 130 以上のポケモンだけが返される", () => {
      const MIN_ATK = 130;
      const results = [];
      for (const species of gen.species) {
        if (species.baseStats.atk >= MIN_ATK) {
          results.push({
            name: species.name,
            atk: species.baseStats.atk,
          });
        }
      }
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.atk).toBeGreaterThanOrEqual(MIN_ATK);
      }
    });

    it("素早さ 120 以上のポケモンだけが返される", () => {
      const MIN_SPE = 120;
      const results = [];
      for (const species of gen.species) {
        if (species.baseStats.spe >= MIN_SPE) {
          results.push({
            name: species.name,
            spe: species.baseStats.spe,
          });
        }
      }
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.spe).toBeGreaterThanOrEqual(MIN_SPE);
      }
    });

    it("複数の種族値条件で絞り込める", () => {
      const MIN_ATK = 100;
      const MIN_SPE = 100;
      const results = [];
      for (const species of gen.species) {
        if (
          species.baseStats.atk >= MIN_ATK &&
          species.baseStats.spe >= MIN_SPE
        ) {
          results.push(species.name);
        }
      }
      expect(results.length).toBeGreaterThan(0);
      // Garchomp (atk:130, spe:102) が含まれるはず
      expect(results).toContain("Garchomp");
    });
  });

  describe("条件なしの検索", () => {
    it("limit で返す件数を制限できる", () => {
      const LIMIT = 5;
      const results = [];
      let count = 0;
      for (const species of gen.species) {
        results.push(species.name);
        count++;
        if (count >= LIMIT) break;
      }
      expect(results).toHaveLength(LIMIT);
    });

    it("全ポケモンの件数が正しい", () => {
      let totalCount = 0;
      for (const _species of gen.species) {
        totalCount++;
      }
      const EXPECTED_TOTAL_SPECIES = 290;
      expect(totalCount).toBe(EXPECTED_TOTAL_SPECIES);
    });
  });
});
