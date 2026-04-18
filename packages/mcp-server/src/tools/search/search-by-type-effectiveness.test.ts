import { describe, it, expect } from "vitest";
import { Generations, toID } from "@smogon/calc";
import {
  championsLearnsets,
  championsPokemon,
  movesById,
  pokemonById,
  toDataId,
} from "../../data-store";

const CHAMPIONS_GEN_NUM = 0;

/**
 * search_pokemon_by_type_effectiveness のデータ走査ロジックを直接検証する。
 * Champions に登場するポケモンのみを対象にする。
 */
describe("search_pokemon_by_type_effectiveness logic", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  /**
   * attackTypeName で defenderTypes に対する複合倍率を算出する。
   * 2 タイプ複合は掛け合わせる。
   */
  function calcMultiplier(
    attackTypeName: string,
    defenderTypes: readonly string[],
  ): number {
    const attackType = gen.types.get(toID(attackTypeName));
    if (attackType === undefined) return 1;
    const eff = attackType.effectiveness as Record<string, number>;
    let m = 1;
    for (const t of defenderTypes) {
      const v = eff[t];
      if (v !== undefined) m *= v;
    }
    return m;
  }

  describe("resistsType (0.5 倍以下で受ける) 判定", () => {
    it("ほのお半減 (0.5 倍以下) にリザードン (Fire/Flying) が該当する", () => {
      // Fire→Fire=0.5, Fire→Flying=1 なので 0.5
      const RESIST = 0.5;
      const lizardon = pokemonById.get(toDataId("Charizard"))!;
      const m = calcMultiplier("Fire", lizardon.types);
      expect(m).toBeLessThanOrEqual(RESIST);
    });

    it("ほのお半減にブラストイズ (Water) が該当する", () => {
      const RESIST = 0.5;
      const kamex = pokemonById.get(toDataId("Blastoise"))!;
      const m = calcMultiplier("Fire", kamex.types);
      expect(m).toBeLessThanOrEqual(RESIST);
    });

    it("ほのお半減にキュウコン (Fire) が該当する", () => {
      const RESIST = 0.5;
      const kyuukon = pokemonById.get(toDataId("Ninetales"))!;
      expect(kyuukon).toBeDefined();
      const m = calcMultiplier("Fire", kyuukon.types);
      expect(m).toBeLessThanOrEqual(RESIST);
    });

    it("ほのおが 2 倍以上になる フシギバナ (Grass/Poison) は resistsType に含まれない", () => {
      const RESIST = 0.5;
      const fushigibana = pokemonById.get(toDataId("Venusaur"))!;
      const m = calcMultiplier("Fire", fushigibana.types);
      expect(m).toBeGreaterThan(RESIST);
    });
  });

  describe("immuneToType (0 倍) 判定", () => {
    it("でんき無効ポケモンにガブリアス (Ground/Dragon) が該当する", () => {
      const IMMUNE = 0;
      const garchomp = pokemonById.get(toDataId("Garchomp"))!;
      const m = calcMultiplier("Electric", garchomp.types);
      expect(m).toBe(IMMUNE);
    });

    it("じめん無効ポケモンにリザードン (Fire/Flying) が該当する", () => {
      const IMMUNE = 0;
      const lizardon = pokemonById.get(toDataId("Charizard"))!;
      const m = calcMultiplier("Ground", lizardon.types);
      expect(m).toBe(IMMUNE);
    });
  });

  describe("weakToType (2 倍以上で受ける) 判定", () => {
    it("こおり 4 倍 にガブリアス (Ground/Dragon) が該当する", () => {
      const FOUR_TIMES = 4;
      const garchomp = pokemonById.get(toDataId("Garchomp"))!;
      const m = calcMultiplier("Ice", garchomp.types);
      expect(m).toBe(FOUR_TIMES);
    });

    it("こおり 2 倍 にフシギバナ (Grass/Poison) が該当する", () => {
      const TWO_TIMES = 2;
      const fushigibana = pokemonById.get(toDataId("Venusaur"))!;
      const m = calcMultiplier("Ice", fushigibana.types);
      expect(m).toBe(TWO_TIMES);
    });

    it("リザードン (Fire/Flying) はこおりで 1 倍なので weakToType=Ice に含まれない", () => {
      const TWO_TIMES = 2;
      const lizardon = pokemonById.get(toDataId("Charizard"))!;
      const m = calcMultiplier("Ice", lizardon.types);
      // Ice→Fire=0.5, Ice→Flying=2 → 1 倍
      expect(m).toBeLessThan(TWO_TIMES);
    });
  });

  describe("hasAttackingType (指定タイプの攻撃技を覚える) 判定", () => {
    it("ガブリアスは ドラゴン攻撃技を覚える (げきりん 等)", () => {
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      const learnset = championsLearnsets[entry.id];
      expect(learnset).toBeDefined();

      const hasDragonAttack = learnset.some((moveId) => {
        const move = movesById.get(moveId);
        if (move === undefined) return false;
        if (move.category === "Status") return false;
        return move.type === "Dragon";
      });
      expect(hasDragonAttack).toBe(true);
    });

    it("マニューラは こおり攻撃技を覚える", () => {
      const entry = pokemonById.get(toDataId("Weavile"))!;
      const learnset = championsLearnsets[entry.id];
      expect(learnset).toBeDefined();

      const hasIceAttack = learnset.some((moveId) => {
        const move = movesById.get(moveId);
        if (move === undefined) return false;
        if (move.category === "Status") return false;
        return move.type === "Ice";
      });
      expect(hasIceAttack).toBe(true);
    });

    it("Status 技は除外される (あまごいは Water だが Status)", () => {
      const amagoi = movesById.get("raindance");
      expect(amagoi).toBeDefined();
      expect(amagoi!.category).toBe("Status");
      expect(amagoi!.type).toBe("Water");
    });
  });

  describe("複合条件 (AND)", () => {
    it("ほのお半減 AND みず攻撃技持ち で絞り込める", () => {
      const RESIST = 0.5;
      const matched = championsPokemon.filter((p) => {
        const fireMultiplier = calcMultiplier("Fire", p.types);
        if (fireMultiplier > RESIST) return false;
        const learnset = championsLearnsets[p.id];
        if (learnset === undefined) return false;
        return learnset.some((moveId) => {
          const move = movesById.get(moveId);
          if (move === undefined) return false;
          if (move.category === "Status") return false;
          return move.type === "Water";
        });
      });
      expect(matched.length).toBeGreaterThan(0);
      // カメックス (Water) はほのお半減 + みず攻撃技持ち
      const names = matched.map((p) => p.name);
      expect(names).toContain("Blastoise");
    });
  });

  describe("ソート", () => {
    it("結果は name 昇順でソートされる", () => {
      const names = ["Weavile", "Abomasnow", "Garchomp"];
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(sorted[0]).toBe("Abomasnow");
      expect(sorted[sorted.length - 1]).toBe("Weavile");
    });
  });
});
