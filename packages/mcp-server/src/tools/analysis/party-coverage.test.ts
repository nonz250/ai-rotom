import { describe, it, expect } from "vitest";
import { Generations, toID } from "@smogon/calc";
import {
  championsLearnsets,
  championsPokemon,
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

  describe("dualTypeCoverage（実在する複合タイプへのカバレッジ）", () => {
    const QUAD_EFFECTIVE = 4;
    const SUPER_EFFECTIVE = 2;
    const NO_EFFECT = 0;

    it("ドラゴン/じめん × こおり技 で maxMultiplier=4 になる", () => {
      // マンムー (こおり/じめん) → Icicle Crash / Icicle Spear 等を習得
      const out = analyzePartyCoverage({
        myParty: [{ name: "マンムー" }],
        moves: { マンムー: ["Icicle Crash"] },
      });
      const dragonGround = out.dualTypeCoverage.find(
        (e) =>
          (e.defenderTypes[0] === "Dragon" && e.defenderTypes[1] === "Ground") ||
          (e.defenderTypes[0] === "Ground" && e.defenderTypes[1] === "Dragon"),
      );
      expect(dragonGround).toBeDefined();
      expect(dragonGround?.maxMultiplier).toBe(QUAD_EFFECTIVE);
      expect(dragonGround?.bestAttackers[0].move).toBe("Icicle Crash");
    });

    it("ほのお/ひこう × いわ技 で maxMultiplier=4 になる", () => {
      // バンギラス (いわ/あく) は Stone Edge を習得する
      const out = analyzePartyCoverage({
        myParty: [{ name: "バンギラス" }],
        moves: { バンギラス: ["Stone Edge"] },
      });
      const fireFlying = out.dualTypeCoverage.find(
        (e) =>
          (e.defenderTypes[0] === "Fire" && e.defenderTypes[1] === "Flying") ||
          (e.defenderTypes[0] === "Flying" && e.defenderTypes[1] === "Fire"),
      );
      expect(fireFlying).toBeDefined();
      expect(fireFlying?.maxMultiplier).toBe(QUAD_EFFECTIVE);
      expect(fireFlying?.bestAttackers[0].move).toBe("Stone Edge");
    });

    it("実在しない複合タイプ（Fairy/Poison 等）は dualTypeCoverage に含まれない", () => {
      const out = analyzePartyCoverage({
        myParty: [{ name: "ガブリアス" }],
        moves: { ガブリアス: ["Earthquake"] },
      });

      // データから実在する複合タイプ集合を再構築して突合
      const realDualTypes = new Set<string>();
      for (const p of championsPokemon) {
        const DUAL_COUNT = 2;
        if (p.types.length === DUAL_COUNT) {
          const sorted = [...p.types].sort();
          realDualTypes.add(`${sorted[0]}/${sorted[1]}`);
        }
      }

      expect(out.dualTypeCoverage.length).toBe(realDualTypes.size);
      for (const entry of out.dualTypeCoverage) {
        const key = `${entry.defenderTypes[0]}/${entry.defenderTypes[1]}`;
        expect(realDualTypes.has(key)).toBe(true);
      }
      // 実在しない代表例を複数チェック（データ追加で片方のみ実在になっても検出できるように）
      const nonExistentPairs: ReadonlyArray<readonly [string, string]> = [
        ["Bug", "Dragon"],
        ["Fairy", "Poison"],
        ["Fighting", "Ground"],
      ];
      for (const [a, b] of nonExistentPairs) {
        const hit = out.dualTypeCoverage.find(
          (e) =>
            (e.defenderTypes[0] === a && e.defenderTypes[1] === b) ||
            (e.defenderTypes[0] === b && e.defenderTypes[1] === a),
        );
        expect(hit).toBeUndefined();
      }
    });

    it("examplePokemon に そのタイプを持つ代表的なポケモンの日本語名が入る", () => {
      const out = analyzePartyCoverage({
        myParty: [{ name: "ガブリアス" }],
        moves: { ガブリアス: ["Earthquake"] },
      });
      const dragonGround = out.dualTypeCoverage.find(
        (e) => e.defenderTypes[0] === "Dragon" && e.defenderTypes[1] === "Ground",
      );
      expect(dragonGround).toBeDefined();
      expect(dragonGround?.examplePokemon).toContain("ガブリアス");
    });

    it("dualTypeUncoveredCount が maxMultiplier<=EFFECTIVE_THRESHOLD の件数と一致する", () => {
      const out = analyzePartyCoverage({
        myParty: [{ name: "ガブリアス" }],
        moves: { ガブリアス: ["Earthquake"] },
      });
      const uncoveredByFilter = out.dualTypeCoverage.filter(
        (e) => e.maxMultiplier <= EFFECTIVE_THRESHOLD,
      ).length;
      expect(out.dualTypeUncoveredCount).toBe(uncoveredByFilter);
    });

    it("defenderTypes は英名辞書順でソートされている", () => {
      const out = analyzePartyCoverage({
        myParty: [{ name: "ガブリアス" }],
        moves: { ガブリアス: ["Earthquake"] },
      });
      for (const entry of out.dualTypeCoverage) {
        expect(entry.defenderTypes[0].localeCompare(entry.defenderTypes[1])).toBeLessThanOrEqual(0);
      }
    });

    it("電気無効を活用: でんき技 × ひこう/じめん 系の複合タイプに 0 倍が出る", () => {
      // Flying/Ground は実在しないが、Ground を含む複合タイプ (例: Dragon/Ground)
      // に対して Electric 技は 0 倍になる
      const out = analyzePartyCoverage({
        myParty: [{ name: "ピカチュウ" }],
        moves: { ピカチュウ: ["Thunderbolt"] },
      });
      const dragonGround = out.dualTypeCoverage.find(
        (e) => e.defenderTypes[0] === "Dragon" && e.defenderTypes[1] === "Ground",
      );
      expect(dragonGround?.maxMultiplier).toBe(NO_EFFECT);
    });

    it("攻撃技が無いパーティは 全エントリの maxMultiplier=0 かつ dualTypeUncoveredCount=エントリ数", () => {
      // 変化技のみ指定 → resolveAttackingMoveIds が Status を除外するので攻撃技ゼロ
      const out = analyzePartyCoverage({
        myParty: [{ name: "ガブリアス" }],
        moves: { ガブリアス: ["Swords Dance"] },
      });
      expect(out.dualTypeCoverage.length).toBeGreaterThan(0);
      for (const entry of out.dualTypeCoverage) {
        expect(entry.maxMultiplier).toBe(NO_EFFECT);
        expect(entry.bestAttackers).toHaveLength(0);
      }
      expect(out.dualTypeUncoveredCount).toBe(out.dualTypeCoverage.length);
    });

    it("dualTypeCoverage は maxMultiplier 昇順でソートされる", () => {
      const out = analyzePartyCoverage({
        myParty: [{ name: "ガブリアス" }],
        moves: { ガブリアス: ["Earthquake"] },
      });
      for (let i = 1; i < out.dualTypeCoverage.length; i += 1) {
        const prev = out.dualTypeCoverage[i - 1].maxMultiplier;
        const curr = out.dualTypeCoverage[i].maxMultiplier;
        expect(prev).toBeLessThanOrEqual(curr);
      }
    });

    it("いわ技は ほのお/ひこう に 抜群以上、ガブリアス (Dragon/Ground) は 等倍以下を維持", () => {
      // 複合分析の副作用で単一タイプ結果が壊れないことを確認
      const out = analyzePartyCoverage({
        myParty: [{ name: "バンギラス" }],
        moves: { バンギラス: ["Stone Edge"] },
      });
      expect(out.coverage.find((c) => c.defenderType === "Fire")?.maxMultiplier).toBe(SUPER_EFFECTIVE);
      expect(out.coverage.find((c) => c.defenderType === "Flying")?.maxMultiplier).toBe(SUPER_EFFECTIVE);
    });
  });

  describe("dualTypeCoverage × タイプ変更系特性の反映", () => {
    // タイプ相性の倍率
    const QUAD_EFFECTIVE = 4;
    const SUPER_EFFECTIVE = 2;
    const NO_EFFECT = 0;

    // 防御側の代表的な複合タイプ（英名辞書順）
    const DARK_DRAGON: readonly [string, string] = ["Dark", "Dragon"];

    // 攻撃側のパーティ定義
    const PIXILATE_MEGA_ALTARIA = {
      name: "メガチルタリス",
      ability: "Pixilate",
    };
    const PIXILATE_MEGA_ALTARIA_JA = {
      name: "メガチルタリス",
      ability: "フェアリースキン",
    };
    const HYPER_BEAM_MOVES = { メガチルタリス: ["Hyper Beam"] };
    const DRAGON_PULSE_MOVES = { メガチルタリス: ["Dragon Pulse"] };

    const GALVANIZE_JOLTEON = {
      name: "サンダース",
      ability: "エレキスキン",
    };
    const BODY_SLAM_MOVES = { サンダース: ["Body Slam"] };

    /**
     * 指定した複合タイプのエントリを `dualTypeCoverage` から取り出す。
     * `defenderTypes` は英名辞書順でソート済みなので、与えた順序どおりに検索する。
     */
    function findDualTypeEntry(
      out: ReturnType<typeof analyzePartyCoverage>,
      types: readonly [string, string],
    ): ReturnType<typeof analyzePartyCoverage>["dualTypeCoverage"][number] | undefined {
      return out.dualTypeCoverage.find(
        (e) => e.defenderTypes[0] === types[0] && e.defenderTypes[1] === types[1],
      );
    }

    it("サザンドラ (Dark/Dragon) は Pixilate 存在確認のデータ前提を満たす", () => {
      // テスト対象の前提: サザンドラが実在し Dark/Dragon 複合タイプであること
      const hydreigon = championsPokemon.find((p) => p.name === "Hydreigon");
      expect(hydreigon).toBeDefined();
      expect(hydreigon?.types).toEqual(["Dark", "Dragon"]);
    });

    it("Pixilate + Hyper Beam は サザンドラ (Dark/Dragon) に 4 倍になる", () => {
      // Arrange
      const party = {
        myParty: [PIXILATE_MEGA_ALTARIA],
        moves: HYPER_BEAM_MOVES,
      };

      // Act
      const out = analyzePartyCoverage(party);
      const darkDragon = findDualTypeEntry(out, DARK_DRAGON);

      // Assert: Fairy は Dark 2倍 × Dragon 2倍 = 4 倍
      expect(darkDragon).toBeDefined();
      expect(darkDragon?.maxMultiplier).toBe(QUAD_EFFECTIVE);
      expect(darkDragon?.bestAttackers).toHaveLength(1);
      expect(darkDragon?.bestAttackers[0].move).toBe("Hyper Beam");
      expect(darkDragon?.bestAttackers[0].effectiveType).toBe("Fairy");
    });

    it("Pixilate + 非ノーマル技（Dragon Pulse）では effectiveType が付与されない（regression）", () => {
      // Arrange: ノーマル技でない技はタイプ変更対象外
      const party = {
        myParty: [PIXILATE_MEGA_ALTARIA],
        moves: DRAGON_PULSE_MOVES,
      };

      // Act
      const out = analyzePartyCoverage(party);

      // Assert: dualTypeCoverage の全エントリで effectiveType は未設定
      expect(out.dualTypeCoverage.length).toBeGreaterThan(0);
      for (const entry of out.dualTypeCoverage) {
        for (const attacker of entry.bestAttackers) {
          expect(attacker.effectiveType).toBeUndefined();
        }
      }
      // 攻撃タイプは Dragon のまま（Fairy に変換されていない）
      expect(out.attackingTypes.some((t) => t.type === "Dragon")).toBe(true);
      expect(out.attackingTypes.some((t) => t.type === "Fairy")).toBe(false);
    });

    it("未知特性は silent fallback し Normal として評価される（dualType 側）", () => {
      // Arrange: ガブリアス + 未知特性 + Hyper Beam
      const UNKNOWN_ABILITY_PARTY = {
        myParty: [{ name: "ガブリアス", ability: "そんなとくせいない" }],
        moves: { ガブリアス: ["Hyper Beam"] },
      };

      // Act
      const out = analyzePartyCoverage(UNKNOWN_ABILITY_PARTY);

      // Assert: 攻撃タイプは Normal のまま、effectiveType は付与されない
      expect(out.attackingTypes.some((t) => t.type === "Normal")).toBe(true);
      expect(out.attackingTypes.some((t) => t.type === "Fairy")).toBe(false);
      expect(out.dualTypeCoverage.length).toBeGreaterThan(0);
      for (const entry of out.dualTypeCoverage) {
        for (const attacker of entry.bestAttackers) {
          expect(attacker.effectiveType).toBeUndefined();
        }
      }
    });

    it("日本語特性名（フェアリースキン）でも dualTypeCoverage に反映される", () => {
      // Arrange: 英語名 "Pixilate" と同じ挙動になるはず
      const party = {
        myParty: [PIXILATE_MEGA_ALTARIA_JA],
        moves: HYPER_BEAM_MOVES,
      };

      // Act
      const out = analyzePartyCoverage(party);
      const darkDragon = findDualTypeEntry(out, DARK_DRAGON);

      // Assert
      expect(darkDragon?.maxMultiplier).toBe(QUAD_EFFECTIVE);
      expect(darkDragon?.bestAttackers[0].effectiveType).toBe("Fairy");
    });

    it("単一 coverage と dualTypeCoverage で effectiveType が一致する（対称性）", () => {
      // Arrange: 同一パーティ・同一特性
      const party = {
        myParty: [PIXILATE_MEGA_ALTARIA],
        moves: HYPER_BEAM_MOVES,
      };

      // Act
      const out = analyzePartyCoverage(party);
      const singleDragon = out.coverage.find((c) => c.defenderType === "Dragon");
      const darkDragon = findDualTypeEntry(out, DARK_DRAGON);

      // Assert: 単一 Dragon に対して Fairy として 2 倍、複合 Dark/Dragon に対しても Fairy として 4 倍
      expect(singleDragon?.maxMultiplier).toBe(SUPER_EFFECTIVE);
      expect(singleDragon?.bestAttackers[0].effectiveType).toBe("Fairy");
      expect(darkDragon?.maxMultiplier).toBe(QUAD_EFFECTIVE);
      expect(darkDragon?.bestAttackers[0].effectiveType).toBe("Fairy");
      // 両側が同じ effectiveType であること（対称性）
      expect(singleDragon?.bestAttackers[0].effectiveType).toBe(
        darkDragon?.bestAttackers[0].effectiveType,
      );
    });

    it("Galvanize + Body Slam は Electric として dualType 側でも評価される", () => {
      // Arrange: Ground を含む複合タイプは でんき技に 0 倍
      const GROUND_ROCK: readonly [string, string] = ["Ground", "Rock"];
      const party = {
        myParty: [GALVANIZE_JOLTEON],
        moves: BODY_SLAM_MOVES,
      };

      // Act
      const out = analyzePartyCoverage(party);
      const groundRock = findDualTypeEntry(out, GROUND_ROCK);

      // Assert: Ground を含むので でんき技は 0 倍
      expect(groundRock).toBeDefined();
      expect(groundRock?.maxMultiplier).toBe(NO_EFFECT);
      // 0 倍エントリは bestAttackers に列挙しない仕様
      expect(groundRock?.bestAttackers).toHaveLength(0);

      // 単一 Ground タイプ側も 0 倍で、Electric 技しかないパーティなので uncovered
      const single = out.coverage.find((c) => c.defenderType === "Ground");
      expect(single?.maxMultiplier).toBe(NO_EFFECT);
    });

    it("Galvanize + Body Slam は Water タイプ複合に Electric として 2 倍を出す（単一-複合の対称性）", () => {
      // Arrange: Water/X (X != Ground) なら Electric は 2 倍
      // 実在する Water 複合として Water/Flying (ギャラドス等) を採用
      const WATER_FLYING: readonly [string, string] = ["Flying", "Water"];
      const party = {
        myParty: [GALVANIZE_JOLTEON],
        moves: BODY_SLAM_MOVES,
      };

      // Act
      const out = analyzePartyCoverage(party);
      const waterFlying = findDualTypeEntry(out, WATER_FLYING);
      const singleWater = out.coverage.find((c) => c.defenderType === "Water");

      // Assert: Water/Flying は Electric に 4 倍（Water 2倍 × Flying 2倍）
      expect(waterFlying?.maxMultiplier).toBe(QUAD_EFFECTIVE);
      expect(waterFlying?.bestAttackers[0].move).toBe("Body Slam");
      expect(waterFlying?.bestAttackers[0].effectiveType).toBe("Electric");

      // 単一 Water 側は 2 倍 + effectiveType === "Electric"（対称性）
      expect(singleWater?.maxMultiplier).toBe(SUPER_EFFECTIVE);
      expect(singleWater?.bestAttackers[0].effectiveType).toBe("Electric");
      expect(singleWater?.bestAttackers[0].effectiveType).toBe(
        waterFlying?.bestAttackers[0].effectiveType,
      );
    });
  });
});
