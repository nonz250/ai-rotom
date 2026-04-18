import { describe, it, expect } from "vitest";
import { Generations, Pokemon } from "@smogon/calc";
import { DamageCalculatorAdapter } from "../../calc/damage-calculator";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../../name-resolvers";

const CHAMPIONS_GEN_NUM = 0;

describe("analyze_matchup logic", () => {
  const adapter = new DamageCalculatorAdapter({
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  });

  describe("正常系", () => {
    it("日本語名でマッチアップ分析が実行できる", () => {
      const { pokemon: p1, resolvedName: name1 } =
        adapter.createPokemonObject({ name: "リザードン" });
      const { pokemon: p2, resolvedName: name2 } =
        adapter.createPokemonObject({ name: "ギャラドス" });

      expect(name1).toBe("Charizard");
      expect(name2).toBe("Gyarados");
      expect(p1.stats.spe).toBeGreaterThan(0);
      expect(p2.stats.spe).toBeGreaterThan(0);

      // 双方向のダメージ計算
      const p1Attacks = adapter.calculateAllMoves({
        attacker: { name: "リザードン" },
        defender: { name: "ギャラドス" },
      });

      const p2Attacks = adapter.calculateAllMoves({
        attacker: { name: "ギャラドス" },
        defender: { name: "リザードン" },
      });

      expect(p1Attacks.length).toBeGreaterThan(0);
      expect(p2Attacks.length).toBeGreaterThan(0);
    });

    it("素早さ比較が正しく行われる", () => {
      const gen = Generations.get(CHAMPIONS_GEN_NUM);

      // リザードン (base spe: 100) vs ギャラドス (base spe: 81)
      const charizard = new Pokemon(gen, "Charizard");
      const gyarados = new Pokemon(gen, "Gyarados");

      expect(charizard.stats.spe).toBeGreaterThan(gyarados.stats.spe);
    });

    it("能力ポイントによる素早さ変動が反映される", () => {
      const { pokemon: pDefault } = adapter.createPokemonObject({
        name: "ギャラドス",
      });

      const { pokemon: pMaxSpe } = adapter.createPokemonObject({
        name: "ギャラドス",
        nature: "ようき",
        evs: { spe: 32 },
      });

      expect(pMaxSpe.stats.spe).toBeGreaterThan(pDefault.stats.spe);
    });
  });

  describe("エラー系", () => {
    it("存在しないポケモン名でエラーになる", () => {
      expect(() =>
        adapter.createPokemonObject({ name: "ソニック" }),
      ).toThrow("ポケモン「ソニック」が見つかりません。");
    });
  });
});
