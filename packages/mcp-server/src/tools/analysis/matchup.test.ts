import { describe, it, expect } from "vitest";
import { Generations, Pokemon } from "@smogon/calc";
import { DamageCalculatorAdapter, extractPriorityMoves } from "@ai-rotom/shared";
import {
  championsLearnsets,
  movesById,
  pokemonEntryProvider,
  toDataId,
} from "../../data-store";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../../name-resolvers";

const CHAMPIONS_GEN_NUM = 0;

describe("analyze_matchup logic", () => {
  const adapter = new DamageCalculatorAdapter(
    {
      pokemon: pokemonNameResolver,
      move: moveNameResolver,
      ability: abilityNameResolver,
      item: itemNameResolver,
      nature: natureNameResolver,
    },
    pokemonEntryProvider,
  );

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

  describe("先制技抽出", () => {
    function priorityMovesFor(resolvedName: string) {
      const learnsetMoveIds =
        championsLearnsets[toDataId(resolvedName)] ?? [];
      return extractPriorityMoves({
        learnsetMoveIds,
        resolveMove: (id) => movesById.get(id),
        toJapanese: (en) => moveNameResolver.toJapanese(en),
      });
    }

    it("先制技を持つポケモン（イワパレス）から静的 priority 技が抽出される", () => {
      const result = priorityMovesFor("Incineroar");

      expect(result.length).toBeGreaterThan(0);
      const fakeout = result.find((m) => m.move === "Fake Out");
      expect(fakeout).toBeDefined();
      expect(fakeout?.priority).toBe(3);
      expect(fakeout?.moveJa).toBe("ねこだまし");
      expect(fakeout?.category).toBe("Physical");
    });

    it("priority 降順でソートされる", () => {
      const result = priorityMovesFor("Incineroar");

      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].priority).toBeGreaterThanOrEqual(
          result[i].priority,
        );
      }
    });

    it("先制技を持たないポケモン（メタモン）では空配列を返す", () => {
      const result = priorityMovesFor("Ditto");

      expect(result).toEqual([]);
    });

    it("learnset が未登録のポケモン名でも空配列を返す（防衛的フォールバック）", () => {
      const result = priorityMovesFor("NonExistentPokemon");

      expect(result).toEqual([]);
    });
  });
});
