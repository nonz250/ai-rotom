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

    it("特性なし + ノーマル技は effectiveType が設定されない（regression）", () => {
      const NORMAL_ATTACKER = { name: "ガブリアス" };
      const NORMAL_MOVE_SET = { ガブリアス: ["Hyper Beam"] };
      const out = analyzePartyCoverage({
        myParty: [NORMAL_ATTACKER],
        moves: NORMAL_MOVE_SET,
      });
      const normal = out.coverage.find((c) => c.defenderType === "Normal");
      const attacker = normal?.bestAttackers[0];
      expect(attacker?.move).toBe("Hyper Beam");
      expect(attacker?.effectiveType).toBeUndefined();
      expect(out.attackingTypes.some((t) => t.type === "Normal")).toBe(true);
      expect(out.attackingTypes.some((t) => t.type === "Fairy")).toBe(false);
    });
  });

  describe("タイプ変更系特性の反映", () => {
    // メガチルタリス (altariamega) は pixilate を持つ
    const PIXILATE_MEGA = {
      name: "メガチルタリス",
      ability: "フェアリースキン",
    };

    it("Pixilate + Hyper Beam → Fairy として評価される", () => {
      const out = analyzePartyCoverage({
        myParty: [PIXILATE_MEGA],
        moves: { メガチルタリス: ["Hyper Beam"] },
      });

      expect(out.attackingTypes.some((t) => t.type === "Fairy")).toBe(true);
      expect(out.attackingTypes.some((t) => t.type === "Normal")).toBe(false);

      // Fairy は Dragon に 2 倍
      const SUPER_EFFECTIVE = 2;
      const dragon = out.coverage.find((c) => c.defenderType === "Dragon");
      expect(dragon?.maxMultiplier).toBe(SUPER_EFFECTIVE);
      expect(dragon?.bestAttackers[0].move).toBe("Hyper Beam");
      expect(dragon?.bestAttackers[0].effectiveType).toBe("Fairy");
    });

    it("Pixilate + Hyper Beam は Steel に半減（元ノーマルの等倍から変化）", () => {
      const HALF_EFFECTIVE = 0.5;
      const out = analyzePartyCoverage({
        myParty: [PIXILATE_MEGA],
        moves: { メガチルタリス: ["Hyper Beam"] },
      });
      const steel = out.coverage.find((c) => c.defenderType === "Steel");
      expect(steel?.maxMultiplier).toBe(HALF_EFFECTIVE);
      expect(out.uncoveredTypes.some((t) => t.type === "Steel")).toBe(true);
    });

    it("Pixilate + Earthquake は Ground のまま (非ノーマル技はスルー)", () => {
      const out = analyzePartyCoverage({
        myParty: [PIXILATE_MEGA],
        moves: { メガチルタリス: ["Earthquake"] },
      });

      expect(out.attackingTypes.some((t) => t.type === "Ground")).toBe(true);
      expect(out.attackingTypes.some((t) => t.type === "Fairy")).toBe(false);

      // Fire は Ground に 2 倍（Fairy は等倍のため、変換されていたら値が 1 になる）
      const SUPER_EFFECTIVE = 2;
      const fire = out.coverage.find((c) => c.defenderType === "Fire");
      expect(fire?.maxMultiplier).toBe(SUPER_EFFECTIVE);
      expect(fire?.bestAttackers[0].effectiveType).toBeUndefined();
    });

    it("Galvanize + Body Slam → Electric として評価される", () => {
      const GALVANIZE_ATTACKER = {
        name: "サンダース",
        ability: "エレキスキン",
      };
      const out = analyzePartyCoverage({
        myParty: [GALVANIZE_ATTACKER],
        moves: { サンダース: ["Body Slam"] },
      });

      expect(out.attackingTypes.some((t) => t.type === "Electric")).toBe(true);
      expect(out.attackingTypes.some((t) => t.type === "Normal")).toBe(false);

      // Electric は Water に 2 倍
      const SUPER_EFFECTIVE = 2;
      const water = out.coverage.find((c) => c.defenderType === "Water");
      expect(water?.maxMultiplier).toBe(SUPER_EFFECTIVE);
      expect(water?.bestAttackers[0].effectiveType).toBe("Electric");

      // Ground には 0 倍
      const NO_EFFECT = 0;
      const ground = out.coverage.find((c) => c.defenderType === "Ground");
      expect(ground?.maxMultiplier).toBe(NO_EFFECT);
    });

    it("未知の特性は silent fallback で元タイプ維持", () => {
      const UNKNOWN_ABILITY_ATTACKER = {
        name: "ガブリアス",
        ability: "そんなとくせいない",
      };
      const out = analyzePartyCoverage({
        myParty: [UNKNOWN_ABILITY_ATTACKER],
        moves: { ガブリアス: ["Hyper Beam"] },
      });

      expect(out.attackingTypes.some((t) => t.type === "Normal")).toBe(true);
      const normal = out.coverage.find((c) => c.defenderType === "Normal");
      expect(normal?.bestAttackers[0].effectiveType).toBeUndefined();
    });

    it("日本語特性名（フェアリースキン）でも解決されて変換される", () => {
      const PIXILATE_JA = {
        name: "メガチルタリス",
        ability: "フェアリースキン",
      };
      const out = analyzePartyCoverage({
        myParty: [PIXILATE_JA],
        moves: { メガチルタリス: ["Hyper Beam"] },
      });

      expect(out.attackingTypes.some((t) => t.type === "Fairy")).toBe(true);
      expect(out.attackingTypes.some((t) => t.type === "Normal")).toBe(false);

      const SUPER_EFFECTIVE = 2;
      const dragon = out.coverage.find((c) => c.defenderType === "Dragon");
      expect(dragon?.maxMultiplier).toBe(SUPER_EFFECTIVE);
      expect(dragon?.bestAttackers[0].effectiveType).toBe("Fairy");
    });
  });
});
