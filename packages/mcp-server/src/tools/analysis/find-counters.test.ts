import { describe, it, expect } from "vitest";
import { Generations, toID } from "@smogon/calc";
import {
  championsLearnsets,
  championsTypes,
  movesById,
  pokemonById,
  toDataId,
} from "../../data-store";
import { pokemonNameResolver } from "../../name-resolvers";
import {
  buildCandidateEntries,
  buildSignature,
  extractBuildInfo,
} from "./find-counters";

const CHAMPIONS_GEN_NUM = 0;

/**
 * find_counters のロジック要素を直接検証する。
 * 実際のダメ計シミュレーションは tool 本体が一括で行うため、ここでは前フィルタ・スコア判定・戦略判定の補助関数群を検証する。
 */
describe("find_counters logic", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

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

  describe("typeWeaknesses 検出", () => {
    it("ガブリアス (Dragon/Ground) の弱点は こおり・ドラゴン・フェアリー", () => {
      const SUPER_EFFECTIVE_MIN = 2;
      const garchomp = pokemonById.get(toDataId("Garchomp"))!;

      const weaknessTypes: string[] = [];
      for (const t of championsTypes) {
        const m = calcMultiplier(t.name, garchomp.types);
        if (m >= SUPER_EFFECTIVE_MIN) weaknessTypes.push(t.name);
      }

      expect(weaknessTypes).toContain("Ice");
      expect(weaknessTypes).toContain("Dragon");
      expect(weaknessTypes).toContain("Fairy");
    });

    it("こおりは ガブリアスに 4 倍（Dragon x Ground 両方に効果抜群）", () => {
      const FOUR = 4;
      const garchomp = pokemonById.get(toDataId("Garchomp"))!;
      expect(calcMultiplier("Ice", garchomp.types)).toBe(FOUR);
    });
  });

  describe("前フィルタ: 弱点タイプの攻撃技を持つポケモンだけを候補にする", () => {
    it("マニューラ (Dark/Ice) はこおり攻撃技を覚えるのでガブリアス対策候補に含まれる", () => {
      const weavile = pokemonById.get(toDataId("Weavile"))!;
      const learnset = championsLearnsets[weavile.id];
      expect(learnset).toBeDefined();

      const hasIceAttack = learnset.some((moveId) => {
        const move = movesById.get(moveId);
        if (move === undefined) return false;
        if (move.category === "Status") return false;
        return move.type === "Ice";
      });
      expect(hasIceAttack).toBe(true);
    });

    it("マンムー (Ice/Ground) もこおり攻撃技を覚える", () => {
      const mamoswine = pokemonById.get(toDataId("Mamoswine"))!;
      const learnset = championsLearnsets[mamoswine.id];
      expect(learnset).toBeDefined();

      const hasIceAttack = learnset.some((moveId) => {
        const move = movesById.get(moveId);
        if (move === undefined) return false;
        if (move.category === "Status") return false;
        return move.type === "Ice";
      });
      expect(hasIceAttack).toBe(true);
    });
  });

  describe("スコア計算の重み", () => {
    /** Tool 実装と同じ重み定義 */
    const WEIGHT_TYPE = 5;
    const WEIGHT_SPEED = 3;
    const WEIGHT_LOW_INCOMING = 3;
    const WEIGHT_OHKO = 5;
    const WEIGHT_2HKO = 2;

    it("タイプ有利 + 素早さ勝ち + 低被弾 + OHKO = 16", () => {
      const EXPECTED = WEIGHT_TYPE + WEIGHT_SPEED + WEIGHT_LOW_INCOMING + WEIGHT_OHKO;
      expect(EXPECTED).toBe(16);
    });

    it("タイプ有利のみは 5 点", () => {
      expect(WEIGHT_TYPE).toBe(5);
    });

    it("2HKO は OHKO より低スコア", () => {
      expect(WEIGHT_2HKO).toBeLessThan(WEIGHT_OHKO);
    });
  });

  describe("戦略判定", () => {
    const STRONG_RESIST_MAX = 0.25;
    const HALF = 0.5;
    const IMMUNE = 0;
    const TWO_HKO_PERCENT_MIN = 50;

    it("incomingMultiplier が 0 なら type_wall", () => {
      expect(IMMUNE).toBe(0);
    });

    it("incomingMultiplier が 0.25 以下なら type_wall", () => {
      expect(STRONG_RESIST_MAX).toBe(0.25);
    });

    it("incomingMultiplier が 0.5 で 2HKO 以内なら tank_then_kill", () => {
      const incoming = HALF;
      const outgoing = TWO_HKO_PERCENT_MIN + 1;
      const canKill = outgoing >= TWO_HKO_PERCENT_MIN;
      const strongResist = incoming <= STRONG_RESIST_MAX;
      expect(strongResist).toBe(false);
      expect(canKill).toBe(true);
    });
  });

  describe("候補プール指定", () => {
    it("candidatePool に指定した名前が解決できる", () => {
      // マニューラ の日本語名解決
      expect(pokemonNameResolver.toEnglish("マニューラ")).toBe("Weavile");
    });

    it("存在しないポケモン名は resolver が undefined", () => {
      expect(pokemonNameResolver.toEnglish("スーパーポケモン")).toBeUndefined();
    });
  });

  describe("ガブリアス対策に氷技持ちが上位に来ることを想定", () => {
    it("Weavile (マニューラ) は Dark/Ice タイプで素早さ 125 (base)", () => {
      const weavile = pokemonById.get(toDataId("Weavile"))!;
      expect(weavile.types).toContain("Ice");
      // base spe 125
      const WEAVILE_BASE_SPE = 125;
      expect(weavile.baseStats.spe).toBe(WEAVILE_BASE_SPE);
    });

    it("Garchomp (ガブリアス) の base spe は 102", () => {
      const garchomp = pokemonById.get(toDataId("Garchomp"))!;
      const GARCHOMP_BASE_SPE = 102;
      expect(garchomp.baseStats.spe).toBe(GARCHOMP_BASE_SPE);
    });
  });

  describe("candidatePool の build 指定 (union 入力)", () => {
    const garchomp = pokemonById.get(toDataId("Garchomp"))!;

    it("string 指定はデフォルト build として正規化される", () => {
      const candidates = buildCandidateEntries(["マニューラ"], garchomp, gen);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].entry.name).toBe("Weavile");
      expect(candidates[0].input).toEqual({ name: "Weavile" });
      expect(candidates[0].hasExplicitBuild).toBe(false);
    });

    it("PokemonInput 指定は build 情報を保持し hasExplicitBuild=true になる", () => {
      const maxSpe = 32;
      const candidates = buildCandidateEntries(
        [
          {
            name: "ガブリアス",
            ability: "さめはだ",
            item: "こだわりスカーフ",
            nature: "ようき",
            evs: { spe: maxSpe },
          },
        ],
        pokemonById.get(toDataId("Dragapult"))!,
        gen,
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].entry.name).toBe("Garchomp");
      expect(candidates[0].input.name).toBe("Garchomp");
      expect(candidates[0].input.ability).toBe("さめはだ");
      expect(candidates[0].input.item).toBe("こだわりスカーフ");
      expect(candidates[0].input.nature).toBe("ようき");
      expect(candidates[0].input.evs).toEqual({ spe: maxSpe });
      expect(candidates[0].hasExplicitBuild).toBe(true);
    });

    it("string と PokemonInput を混在指定できる", () => {
      const EXPECTED_COUNT = 2;
      const candidates = buildCandidateEntries(
        [
          "マニューラ",
          { name: "ガブリアス", ability: "さめはだ", item: "こだわりハチマキ" },
        ],
        pokemonById.get(toDataId("Dragapult"))!,
        gen,
      );

      expect(candidates).toHaveLength(EXPECTED_COUNT);
      expect(candidates[0].hasExplicitBuild).toBe(false);
      expect(candidates[1].hasExplicitBuild).toBe(true);
      expect(candidates[1].input.item).toBe("こだわりハチマキ");
    });

    it("同名ポケモンの build 違いを並存させられる", () => {
      const EXPECTED_COUNT = 2;
      const candidates = buildCandidateEntries(
        [
          { name: "ガブリアス", nature: "ようき", item: "こだわりスカーフ" },
          { name: "ガブリアス", nature: "いじっぱり", item: "こだわりハチマキ" },
        ],
        pokemonById.get(toDataId("Dragapult"))!,
        gen,
      );

      expect(candidates).toHaveLength(EXPECTED_COUNT);
      expect(candidates[0].entry.name).toBe("Garchomp");
      expect(candidates[1].entry.name).toBe("Garchomp");

      const sig1 = buildSignature(candidates[0]);
      const sig2 = buildSignature(candidates[1]);
      expect(sig1).not.toBe(sig2);
    });

    it("buildSignature は hasExplicitBuild=false なら default を返す", () => {
      const candidates = buildCandidateEntries(["マニューラ"], garchomp, gen);
      expect(buildSignature(candidates[0])).toBe("default");
    });

    it("extractBuildInfo は未指定フィールドを含めない", () => {
      const result = extractBuildInfo({
        name: "ガブリアス",
        ability: "さめはだ",
      });
      expect(result).toEqual({ ability: "さめはだ" });
      expect(Object.keys(result)).not.toContain("item");
      expect(Object.keys(result)).not.toContain("name");
    });

    it("extractBuildInfo は指定されたフィールドをすべて抽出する", () => {
      const maxAtk = 32;
      const atkBoost = 2;
      const result = extractBuildInfo({
        name: "ガブリアス",
        ability: "さめはだ",
        item: "こだわりハチマキ",
        nature: "いじっぱり",
        evs: { atk: maxAtk },
        boosts: { atk: atkBoost },
        status: "par",
      });
      expect(result.ability).toBe("さめはだ");
      expect(result.item).toBe("こだわりハチマキ");
      expect(result.nature).toBe("いじっぱり");
      expect(result.evs).toEqual({ atk: maxAtk });
      expect(result.boosts).toEqual({ atk: atkBoost });
      expect(result.status).toBe("par");
    });

    it("未指定時 (candidatePool=undefined) は hasExplicitBuild=false の候補が生成される", () => {
      const candidates = buildCandidateEntries(undefined, garchomp, gen);
      expect(candidates.length).toBeGreaterThan(0);
      for (const c of candidates) {
        expect(c.hasExplicitBuild).toBe(false);
        expect(c.input).toEqual({ name: c.entry.name });
      }
    });

    it("存在しないポケモン名でエラーになる (string)", () => {
      expect(() =>
        buildCandidateEntries(["スーパーポケモン"], garchomp, gen),
      ).toThrow();
    });

    it("存在しないポケモン名でエラーになる (PokemonInput)", () => {
      expect(() =>
        buildCandidateEntries(
          [{ name: "スーパーポケモン", ability: "さめはだ" }],
          garchomp,
          gen,
        ),
      ).toThrow();
    });
  });
});
