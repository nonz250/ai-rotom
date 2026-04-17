import { describe, it, expect } from "vitest";
import { Generations, toID, Pokemon } from "@smogon/calc";
import {
  MAX_STAT_POINT_TOTAL,
} from "@ai-rotom/shared";
import {
  pokemonNameResolver,
  natureNameResolver,
} from "../name-resolvers";

const CHAMPIONS_GEN_NUM = 0;
const DEFAULT_NATURE_EN = "Serious";

describe("calculate_stats logic", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  describe("正常系", () => {
    it("日本語名でステータス計算ができる", () => {
      const nameEn = pokemonNameResolver.toEnglish("リザードン");
      expect(nameEn).toBe("Charizard");

      const species = gen.species.get(toID(nameEn!))!;
      const pokemon = new Pokemon(gen, species.name, {
        nature: DEFAULT_NATURE_EN,
      });

      expect(pokemon.stats.hp).toBeGreaterThan(0);
      expect(pokemon.stats.atk).toBeGreaterThan(0);
      expect(pokemon.stats.def).toBeGreaterThan(0);
      expect(pokemon.stats.spa).toBeGreaterThan(0);
      expect(pokemon.stats.spd).toBeGreaterThan(0);
      expect(pokemon.stats.spe).toBeGreaterThan(0);
    });

    it("性格の日本語名が英語名に変換できる", () => {
      const natureEn = natureNameResolver.toEnglish("ひかえめ");
      expect(natureEn).toBe("Modest");
    });

    it("性格によるステータス補正が反映される", () => {
      const species = gen.species.get(toID("Charizard"))!;

      const pokemonSerious = new Pokemon(gen, species.name, {
        nature: "Serious",
      });
      const pokemonModest = new Pokemon(gen, species.name, {
        nature: "Modest",
      });

      // ひかえめ: 特攻↑ 攻撃↓
      expect(pokemonModest.stats.spa).toBeGreaterThan(
        pokemonSerious.stats.spa,
      );
      expect(pokemonModest.stats.atk).toBeLessThan(
        pokemonSerious.stats.atk,
      );
    });

    it("能力ポイントによるステータス上昇が反映される", () => {
      const species = gen.species.get(toID("Charizard"))!;

      const pokemonNoEvs = new Pokemon(gen, species.name, {
        nature: "Serious",
      });
      const pokemonWithEvs = new Pokemon(gen, species.name, {
        nature: "Serious",
        evs: { spa: 32, spe: 32 },
      });

      expect(pokemonWithEvs.stats.spa).toBeGreaterThan(
        pokemonNoEvs.stats.spa,
      );
      expect(pokemonWithEvs.stats.spe).toBeGreaterThan(
        pokemonNoEvs.stats.spe,
      );
      // 振っていないステータスは同じ
      expect(pokemonWithEvs.stats.hp).toBe(pokemonNoEvs.stats.hp);
    });

    it("能力ポイントの残りが正しく計算される", () => {
      const EVS_SPA = 32;
      const EVS_SPE = 32;
      const used = EVS_SPA + EVS_SPE;
      const remaining = MAX_STAT_POINT_TOTAL - used;

      const EXPECTED_REMAINING = 2;
      expect(remaining).toBe(EXPECTED_REMAINING);
    });

    it("種族値がゲームデータと一致する", () => {
      const species = gen.species.get(toID("Charizard"))!;

      const CHARIZARD_BASE_HP = 78;
      const CHARIZARD_BASE_ATK = 84;
      const CHARIZARD_BASE_DEF = 78;
      const CHARIZARD_BASE_SPA = 109;
      const CHARIZARD_BASE_SPD = 85;
      const CHARIZARD_BASE_SPE = 100;

      expect(species.baseStats.hp).toBe(CHARIZARD_BASE_HP);
      expect(species.baseStats.atk).toBe(CHARIZARD_BASE_ATK);
      expect(species.baseStats.def).toBe(CHARIZARD_BASE_DEF);
      expect(species.baseStats.spa).toBe(CHARIZARD_BASE_SPA);
      expect(species.baseStats.spd).toBe(CHARIZARD_BASE_SPD);
      expect(species.baseStats.spe).toBe(CHARIZARD_BASE_SPE);
    });
  });

  describe("エラー系", () => {
    it("存在しないポケモン名はundefinedを返す", () => {
      const result = pokemonNameResolver.toEnglish("ソニック");
      expect(result).toBeUndefined();
    });

    it("存在しない性格名はundefinedを返す", () => {
      const result = natureNameResolver.toEnglish("でたらめ");
      expect(result).toBeUndefined();
    });
  });
});
