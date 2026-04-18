import { describe, it, expect } from "vitest";
import { Generations, Pokemon } from "@smogon/calc";
import { MAX_STAT_POINT_TOTAL } from "@ai-rotom/shared";
import {
  pokemonNameResolver,
  natureNameResolver,
} from "../name-resolvers";
import { pokemonById, toDataId } from "../data-store";

const CHAMPIONS_GEN_NUM = 0;

/**
 * pokemon.json ベースで overrides を使った Pokemon 生成のためのヘルパー。
 * calculate_stats ツールと同じロジックを共有する。
 */
function createChampionsPokemon(
  nameEn: string,
  options: { nature?: string; evs?: Partial<Record<string, number>> } = {},
): Pokemon {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);
  const entry = pokemonById.get(toDataId(nameEn))!;

  return new Pokemon(gen, entry.name, {
    nature: options.nature ?? "Serious",
    evs: options.evs,
    overrides: {
      types: entry.types,
      baseStats: entry.baseStats,
    } as NonNullable<ConstructorParameters<typeof Pokemon>[2]>["overrides"],
  });
}

describe("calculate_stats logic", () => {
  describe("正常系", () => {
    it("日本語名でステータス計算ができる", () => {
      const nameEn = pokemonNameResolver.toEnglish("リザードン");
      expect(nameEn).toBe("Charizard");

      const pokemon = createChampionsPokemon(nameEn!);

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
      const serious = createChampionsPokemon("Charizard", {
        nature: "Serious",
      });
      const modest = createChampionsPokemon("Charizard", {
        nature: "Modest",
      });

      // ひかえめ: 特攻↑ 攻撃↓
      expect(modest.stats.spa).toBeGreaterThan(serious.stats.spa);
      expect(modest.stats.atk).toBeLessThan(serious.stats.atk);
    });

    it("能力ポイントによるステータス上昇が反映される", () => {
      const noEvs = createChampionsPokemon("Charizard", { nature: "Serious" });
      const withEvs = createChampionsPokemon("Charizard", {
        nature: "Serious",
        evs: { spa: 32, spe: 32 },
      });

      expect(withEvs.stats.spa).toBeGreaterThan(noEvs.stats.spa);
      expect(withEvs.stats.spe).toBeGreaterThan(noEvs.stats.spe);
      // 振っていないステータスは同じ
      expect(withEvs.stats.hp).toBe(noEvs.stats.hp);
    });

    it("能力ポイントの残りが正しく計算される", () => {
      const EVS_SPA = 32;
      const EVS_SPE = 32;
      const used = EVS_SPA + EVS_SPE;
      const remaining = MAX_STAT_POINT_TOTAL - used;

      const EXPECTED_REMAINING = 2;
      expect(remaining).toBe(EXPECTED_REMAINING);
    });

    it("種族値が pokemon.json と一致する", () => {
      const entry = pokemonById.get(toDataId("Charizard"))!;

      const CHARIZARD_BASE_HP = 78;
      const CHARIZARD_BASE_ATK = 84;
      const CHARIZARD_BASE_DEF = 78;
      const CHARIZARD_BASE_SPA = 109;
      const CHARIZARD_BASE_SPD = 85;
      const CHARIZARD_BASE_SPE = 100;

      expect(entry.baseStats.hp).toBe(CHARIZARD_BASE_HP);
      expect(entry.baseStats.atk).toBe(CHARIZARD_BASE_ATK);
      expect(entry.baseStats.def).toBe(CHARIZARD_BASE_DEF);
      expect(entry.baseStats.spa).toBe(CHARIZARD_BASE_SPA);
      expect(entry.baseStats.spd).toBe(CHARIZARD_BASE_SPD);
      expect(entry.baseStats.spe).toBe(CHARIZARD_BASE_SPE);
    });

    it("メガスターミーの atk は pokemon.json の修正値 100 で計算される", () => {
      // @smogon/calc の内蔵データは atk=140 だが、pokemon.json で 100 に修正済み
      const STARMIE_MEGA_BASE_ATK = 100;
      const entry = pokemonById.get(toDataId("Starmie-Mega"))!;
      expect(entry.baseStats.atk).toBe(STARMIE_MEGA_BASE_ATK);

      // overrides なしで計算した場合と比較すると、atk が異なるはず
      const gen = Generations.get(CHAMPIONS_GEN_NUM);
      const withOverride = createChampionsPokemon("Starmie-Mega");
      const withoutOverride = new Pokemon(gen, "Starmie-Mega");

      // 修正後は atk の実数値が内蔵データ計算時より小さくなる
      expect(withOverride.stats.atk).toBeLessThan(withoutOverride.stats.atk);
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
