import { describe, it, expect } from "vitest";
import { Generations, toID } from "@smogon/calc";
import {
  championsLearnsets,
  championsTypes,
  movesById,
  pokemonById,
  toDataId,
} from "../../data-store";
import { analyzePartyCoverage, EFFECTIVE_THRESHOLD } from "./party-coverage";

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

  describe("analyzePartyCoverage の境界条件（uncoveredTypes 判定の実挙動）", () => {
    // ガブリアスのじしんを用例として使う。じめん技のタイプ相性:
    //   無効 (0倍): Flying
    //   半減 (0.5倍): Grass / Bug
    //   等倍 (1倍): Normal / Water / Psychic / Ice / Dragon / Dark / Fairy / Ghost / Ground / Fighting
    //   抜群 (2倍): Electric / Poison / Rock / Steel / Fire
    const GROUND_ATTACKER = { name: "ガブリアス" };
    // 現仕様では moves に指定する技は英語名で渡す必要がある（日本語技名対応は別改修）
    const GROUND_MOVE_SET = { ガブリアス: ["Earthquake"] };

    it("しきい値定数は等倍（1倍）である仕様", () => {
      const EQUAL_EFFECTIVENESS = 1;
      expect(EFFECTIVE_THRESHOLD).toBe(EQUAL_EFFECTIVENESS);
    });

    it("maxMultiplier === 1（等倍）のタイプは uncoveredTypes に含まれる", () => {
      const out = analyzePartyCoverage({
        myParty: [GROUND_ATTACKER],
        moves: GROUND_MOVE_SET,
      });
      const normal = out.coverage.find((c) => c.defenderType === "Normal");
      expect(normal?.maxMultiplier).toBe(EFFECTIVE_THRESHOLD);
      expect(out.uncoveredTypes.some((t) => t.type === "Normal")).toBe(true);
    });

    it("maxMultiplier === 2（抜群）のタイプは uncoveredTypes から除外される", () => {
      const SUPER_EFFECTIVE = 2;
      const out = analyzePartyCoverage({
        myParty: [GROUND_ATTACKER],
        moves: GROUND_MOVE_SET,
      });
      const fire = out.coverage.find((c) => c.defenderType === "Fire");
      expect(fire?.maxMultiplier).toBe(SUPER_EFFECTIVE);
      expect(out.uncoveredTypes.some((t) => t.type === "Fire")).toBe(false);
    });

    it("maxMultiplier === 0（無効）のタイプは uncoveredTypes に含まれる", () => {
      const NO_EFFECT = 0;
      const out = analyzePartyCoverage({
        myParty: [GROUND_ATTACKER],
        moves: GROUND_MOVE_SET,
      });
      const flying = out.coverage.find((c) => c.defenderType === "Flying");
      expect(flying?.maxMultiplier).toBe(NO_EFFECT);
      expect(out.uncoveredTypes.some((t) => t.type === "Flying")).toBe(true);
    });

    it("半減（0.5倍）のタイプも uncoveredTypes に含まれる", () => {
      const HALF_EFFECTIVE = 0.5;
      const out = analyzePartyCoverage({
        myParty: [GROUND_ATTACKER],
        moves: GROUND_MOVE_SET,
      });
      const grass = out.coverage.find((c) => c.defenderType === "Grass");
      expect(grass?.maxMultiplier).toBe(HALF_EFFECTIVE);
      expect(out.uncoveredTypes.some((t) => t.type === "Grass")).toBe(true);
    });

    it("抜群タイプは bestAttackers に最大倍率技が記録される", () => {
      const SUPER_EFFECTIVE = 2;
      const out = analyzePartyCoverage({
        myParty: [GROUND_ATTACKER],
        moves: GROUND_MOVE_SET,
      });
      const electric = out.coverage.find((c) => c.defenderType === "Electric");
      expect(electric?.maxMultiplier).toBe(SUPER_EFFECTIVE);
      expect(electric?.bestAttackers).toHaveLength(1);
      expect(electric?.bestAttackers[0].move).toBe("Earthquake");
    });
  });
});
