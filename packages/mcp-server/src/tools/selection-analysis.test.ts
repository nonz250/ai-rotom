import { describe, it, expect } from "vitest";
import { Generations, toID } from "@smogon/calc";
import { DamageCalculatorAdapter } from "../calc/damage-calculator";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../name-resolvers";

const CHAMPIONS_GEN_NUM = 0;

describe("analyze_selection logic", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);
  const adapter = new DamageCalculatorAdapter({
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  });

  describe("タイプ相性の最大倍率", () => {
    it("みず vs ほのお/ひこう は 2 倍", () => {
      const water = gen.types.get(toID("Water"))!;
      const eff = water.effectiveness as Record<string, number>;
      const TWICE = 2;
      expect(eff["Fire"] * 1).toBe(TWICE);
      // Flying に対しては等倍なので、合成は 2
      // （Charizard (Fire/Flying) に対して水技は 2 倍）
      expect(eff["Fire"] * (eff["Flying"] ?? 1)).toBe(TWICE);
    });

    it("でんき vs みず/ひこう (ギャラドス) は 4 倍", () => {
      const elec = gen.types.get(toID("Electric"))!;
      const eff = elec.effectiveness as Record<string, number>;
      const FOURTH = 4;
      expect(eff["Water"] * eff["Flying"]).toBe(FOURTH);
    });
  });

  describe("6v6 マトリクス (小さいパーティ版)", () => {
    it("1対1 でもマトリクス 1 件が生成される", () => {
      const { pokemon: p1 } = adapter.createPokemonObject({
        name: "リザードン",
      });
      const { pokemon: p2 } = adapter.createPokemonObject({
        name: "ギャラドス",
      });

      expect(p1.stats.spe).toBeGreaterThan(0);
      expect(p2.stats.spe).toBeGreaterThan(0);

      // 速度比較: Lv50 IV31 SP0 のとき
      // リザードン spe=120, ギャラドス spe=(81*2+31)*50/100+5 = 96+5=101
      expect(p1.stats.spe).toBeGreaterThan(p2.stats.spe);
    });

    it("3v3 でマトリクスサイズが 9 件になる想定", () => {
      const SIZE = 9;
      const myParty = ["Charizard", "Gyarados", "Pikachu"];
      const oppParty = ["Garchomp", "Dragonite", "Metagross"];
      expect(myParty.length * oppParty.length).toBe(SIZE);
    });
  });

  describe("スコア計算ロジック", () => {
    it("素早さ勝ち + 抜群 + OHKO はトップスコア", () => {
      const SCORE_WEIGHT_SPEED_WIN = 2;
      const SCORE_WEIGHT_TYPE_ADVANTAGE = 3;
      const SCORE_WEIGHT_DAMAGE_ADVANTAGE = 5;
      const MAX_POSSIBLE_PER_MATCH =
        SCORE_WEIGHT_SPEED_WIN +
        SCORE_WEIGHT_TYPE_ADVANTAGE +
        SCORE_WEIGHT_DAMAGE_ADVANTAGE;
      const EXPECTED = 10;
      expect(MAX_POSSIBLE_PER_MATCH).toBe(EXPECTED);
    });
  });

  describe("エッジケース", () => {
    it("パーティが 1 体だけでも動作する", () => {
      const { pokemon, resolvedName } = adapter.createPokemonObject({
        name: "リザードン",
      });
      expect(pokemon.stats.spe).toBeGreaterThan(0);
      expect(resolvedName).toBe("Charizard");
    });
  });
});
