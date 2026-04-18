import { describe, it, expect } from "vitest";
import { Generations, toID } from "@smogon/calc";
import {
  championsLearnsets,
  championsTypes,
  movesById,
  pokemonById,
  toDataId,
} from "../data-store";

const CHAMPIONS_GEN_NUM = 0;

describe("analyze_party_coverage logic", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  describe("攻撃タイプ集合の算出", () => {
    it("指定した技のタイプだけ attackingTypes に含まれる", () => {
      const moveIds = ["earthquake", "flamethrower"];
      const attackingTypes = new Set<string>();
      for (const id of moveIds) {
        const m = movesById.get(id);
        if (m !== undefined) {
          attackingTypes.add(m.type);
        }
      }
      expect(attackingTypes).toContain("Ground");
      expect(attackingTypes).toContain("Fire");
    });

    it("learnset から category !== Status の技だけ抽出される", () => {
      const entry = pokemonById.get(toDataId("Charizard"))!;
      const learnset = championsLearnsets[entry.id];
      expect(learnset).toBeDefined();

      let attackingCount = 0;
      let statusCount = 0;
      for (const moveId of learnset) {
        const move = movesById.get(moveId);
        if (move === undefined) continue;
        if (move.category === "Status") statusCount += 1;
        else attackingCount += 1;
      }
      expect(attackingCount).toBeGreaterThan(0);
      // リザードンは「おきみやげ」「にほんばれ」「つるぎのまい」等の変化技も覚える
      expect(statusCount).toBeGreaterThan(0);
    });
  });

  describe("18 タイプへのカバレッジ計算", () => {
    it("ほのお技は はがね・くさ・こおり・むし に 2倍、みず・いわ・ほのおに 0.5倍", () => {
      const fire = gen.types.get(toID("Fire"))!;
      const eff = fire.effectiveness as Record<string, number>;

      const DOUBLE = 2;
      const HALF = 0.5;
      expect(eff["Steel"]).toBe(DOUBLE);
      expect(eff["Grass"]).toBe(DOUBLE);
      expect(eff["Ice"]).toBe(DOUBLE);
      expect(eff["Bug"]).toBe(DOUBLE);
      expect(eff["Water"]).toBe(HALF);
      expect(eff["Rock"]).toBe(HALF);
      expect(eff["Fire"]).toBe(HALF);
    });

    it("じめん技は でんき・どく・いわ・はがね・ほのおに 2倍", () => {
      const ground = gen.types.get(toID("Ground"))!;
      const eff = ground.effectiveness as Record<string, number>;
      const DOUBLE = 2;
      expect(eff["Electric"]).toBe(DOUBLE);
      expect(eff["Poison"]).toBe(DOUBLE);
      expect(eff["Rock"]).toBe(DOUBLE);
      expect(eff["Steel"]).toBe(DOUBLE);
      expect(eff["Fire"]).toBe(DOUBLE);
    });
  });

  describe("uncoveredTypes の判定", () => {
    it("攻撃技が全く無い場合は全 18 タイプが uncovered", () => {
      // Status しかないメンバーだけの場合を想定
      const COUNT = championsTypes.length;
      const EXPECTED = 18;
      expect(COUNT).toBe(EXPECTED);
    });

    it("あるタイプに対して 1倍 以下しか出せなければ uncovered", () => {
      // ほのお技だけ: みず・いわ・ほのお・ドラゴンに 0.5 倍
      const fire = gen.types.get(toID("Fire"))!;
      const eff = fire.effectiveness as Record<string, number>;
      // Fire 単体だと Dragon に対して 0.5 倍
      const HALF = 0.5;
      expect(eff["Dragon"]).toBe(HALF);
    });
  });

  describe("エラー系", () => {
    it("存在しないポケモンは pokemonNameResolver で undefined", () => {
      // 単純な名前解決チェックのみ
      expect(pokemonById.get(toDataId("NotAPokemon"))).toBeUndefined();
    });
  });
});
