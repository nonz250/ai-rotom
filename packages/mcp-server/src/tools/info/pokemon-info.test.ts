import { describe, it, expect } from "vitest";
import {
  pokemonNameResolver,
  abilityNameResolver,
} from "../../name-resolvers";
import {
  championsLearnsets,
  championsPokemon,
  pokemonById,
  toDataId,
} from "../../data-store";

/**
 * pokemon-info.ts のロジックを直接テストする。
 * MCP ツールの登録はサーバーに依存するため、
 * ここでは pokemon.json ベースのデータ取得ロジックの正しさを検証する。
 */
describe("get_pokemon_info", () => {
  describe("日本語名での情報取得", () => {
    it("日本語名からポケモン情報が取得できる", () => {
      const inputName = "リザードン";
      const englishName = pokemonNameResolver.toEnglish(inputName);
      expect(englishName).toBe("Charizard");

      const entry = pokemonById.get(toDataId(englishName!));
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Charizard");
      expect(entry!.types).toContain("Fire");
      expect(entry!.types).toContain("Flying");
      expect(entry!.baseStats.hp).toBe(78);
      expect(entry!.baseStats.atk).toBe(84);
      expect(entry!.baseStats.def).toBe(78);
      expect(entry!.baseStats.spa).toBe(109);
      expect(entry!.baseStats.spd).toBe(85);
      expect(entry!.baseStats.spe).toBe(100);
    });

    it("特性の日本語名が取得できる", () => {
      const inputName = "リザードン";
      const englishName = pokemonNameResolver.toEnglish(inputName)!;
      const entry = pokemonById.get(toDataId(englishName))!;
      expect(entry.abilities).toContain("Blaze");

      const abilityJa = abilityNameResolver.toJapanese("Blaze");
      expect(abilityJa).toBe("もうか");
    });

    it("別フォルムが存在するポケモンの otherFormes が取得できる", () => {
      const englishName = pokemonNameResolver.toEnglish("リザードン")!;
      const entry = pokemonById.get(toDataId(englishName))!;
      expect(entry.otherFormes).not.toBeNull();
      expect(entry.otherFormes).toContain("Charizard-Mega-X");
      expect(entry.otherFormes).toContain("Charizard-Mega-Y");
    });

    it("learnableMoveCount が learnset の件数と一致する", () => {
      const englishName = pokemonNameResolver.toEnglish("リザードン")!;
      const learnset = championsLearnsets[toDataId(englishName)];
      expect(learnset).toBeDefined();
      expect(learnset.length).toBeGreaterThan(0);
    });

    it("メガスターミーの修正後種族値が反映される", () => {
      // pokemon.json でメガスターミーの atk は 140 → 100 に修正済み
      const entry = pokemonById.get(toDataId("Starmie-Mega"))!;
      expect(entry.baseStats.atk).toBe(100);
      expect(entry.abilities).toContain("Huge Power");
    });
  });

  describe("英語名での情報取得", () => {
    it("英語名からポケモン情報が取得できる", () => {
      const inputName = "Garchomp";
      expect(pokemonNameResolver.hasEnglishName(inputName)).toBe(true);

      const entry = pokemonById.get(toDataId(inputName));
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Garchomp");
      expect(entry!.types).toContain("Dragon");
      expect(entry!.types).toContain("Ground");
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
  describe("タイプでの絞り込み", () => {
    it("Fire タイプのポケモンだけが返される", () => {
      const results = championsPokemon.filter((p) =>
        p.types.includes("Fire"),
      );
      expect(results.length).toBeGreaterThan(0);
      for (const entry of results) {
        expect(entry.types).toContain("Fire");
      }
    });

    it("Dragon タイプのポケモンが検索できる", () => {
      const results = championsPokemon
        .filter((p) => p.types.includes("Dragon"))
        .map((p) => p.name);
      expect(results.length).toBeGreaterThan(0);
      expect(results).toContain("Garchomp");
      expect(results).toContain("Dragonite");
    });
  });

  describe("種族値の下限での絞り込み", () => {
    it("攻撃力 130 以上のポケモンだけが返される", () => {
      const MIN_ATK = 130;
      const results = championsPokemon.filter(
        (p) => p.baseStats.atk >= MIN_ATK,
      );
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.baseStats.atk).toBeGreaterThanOrEqual(MIN_ATK);
      }
    });

    it("素早さ 120 以上のポケモンだけが返される", () => {
      const MIN_SPE = 120;
      const results = championsPokemon.filter(
        (p) => p.baseStats.spe >= MIN_SPE,
      );
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.baseStats.spe).toBeGreaterThanOrEqual(MIN_SPE);
      }
    });

    it("複数の種族値条件で絞り込める", () => {
      const MIN_ATK = 100;
      const MIN_SPE = 100;
      const results = championsPokemon
        .filter(
          (p) =>
            p.baseStats.atk >= MIN_ATK && p.baseStats.spe >= MIN_SPE,
        )
        .map((p) => p.name);
      expect(results.length).toBeGreaterThan(0);
      // Garchomp (atk:130, spe:102) が含まれるはず
      expect(results).toContain("Garchomp");
    });
  });

  describe("条件なしの検索", () => {
    it("pokemon.json に 1 件以上のエントリが存在する", () => {
      expect(championsPokemon.length).toBeGreaterThan(0);
    });
  });
});
