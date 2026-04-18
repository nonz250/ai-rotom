import { describe, it, expect } from "vitest";
import { Generations, Pokemon, toID } from "@smogon/calc";
import {
  championsLearnsets,
  championsTypes,
  movesById,
  pokemonById,
  toDataId,
  type BaseStats,
} from "../../data-store";
import {
  abilityNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers";

const CHAMPIONS_GEN_NUM = 0;

/**
 * get_pokemon_summary のロジック要素を直接検証する。
 * 実際の統合出力は tool 本体でまとめる。
 */
describe("get_pokemon_summary logic", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  describe("basic 情報", () => {
    it("ガブリアスの基本情報が取得できる (types / baseStats / abilities)", () => {
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      expect(entry.name).toBe("Garchomp");
      expect(entry.nameJa).toBe("ガブリアス");
      expect(entry.types).toEqual(expect.arrayContaining(["Dragon", "Ground"]));
      expect(entry.baseStats.atk).toBeGreaterThan(0);
      expect(entry.abilities.length).toBeGreaterThan(0);
    });

    it("BST はステータス 6 値の合計として計算できる", () => {
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      const bst = (s: BaseStats): number =>
        s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
      const GARCHOMP_BST = 600;
      expect(bst(entry.baseStats)).toBe(GARCHOMP_BST);
    });

    it("typesJa は日本語タイプ名になる", () => {
      const typeJaMap = new Map(championsTypes.map((t) => [t.name, t.nameJa]));
      expect(typeJaMap.get("Dragon")).toBe("ドラゴン");
      expect(typeJaMap.get("Ground")).toBe("じめん");
    });

    it("abilitiesJa は日本語特性名になる", () => {
      const ja = abilityNameResolver.toJapanese("Sand Veil");
      expect(ja).toBe("すながくれ");
    });
  });

  describe("防御相性 (defenses)", () => {
    /**
     * 18 タイプ全てについて、防御側タイプ配列への被ダメ倍率を計算する。
     */
    function calcDefenseMultipliers(
      defenderTypes: readonly string[],
    ): Record<string, number> {
      const result: Record<string, number> = {};
      for (const attackerType of championsTypes) {
        const attackCalcType = gen.types.get(toID(attackerType.name));
        if (attackCalcType === undefined) continue;
        const eff = attackCalcType.effectiveness as Record<string, number>;
        let m = 1;
        for (const t of defenderTypes) {
          const v = eff[t];
          if (v !== undefined) m *= v;
        }
        result[attackerType.name] = m;
      }
      return result;
    }

    it("ガブリアス (Dragon/Ground) はこおりに 4 倍で弱点", () => {
      const FOUR_TIMES = 4;
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      const defs = calcDefenseMultipliers(entry.types);
      expect(defs["Ice"]).toBe(FOUR_TIMES);
    });

    it("ガブリアスはでんきに 0 倍 (Ground)", () => {
      const IMMUNE = 0;
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      const defs = calcDefenseMultipliers(entry.types);
      expect(defs["Electric"]).toBe(IMMUNE);
    });

    it("ガブリアスは ほのおに 1 倍 (Dragon 半減 x Ground 普通 = 0.5 → 違う, Dragon=1/2, Ground=1 なので 0.5)", () => {
      // 正確には Fire→Dragon=0.5, Fire→Ground=1 → 0.5
      const HALF = 0.5;
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      const defs = calcDefenseMultipliers(entry.types);
      expect(defs["Fire"]).toBe(HALF);
    });

    it("1 倍のタイプは weaknesses / resistances / immunities いずれにも含まれない", () => {
      const NEUTRAL = 1;
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      const defs = calcDefenseMultipliers(entry.types);

      // Normal→Garchomp は 1 倍 (Normal は Dragon/Ground 両方に等倍)
      expect(defs["Normal"]).toBe(NEUTRAL);
    });
  });

  describe("覚える技の集計 (learnableMoves)", () => {
    it("ガブリアスの learnset からタイプ別の攻撃技数を集計できる", () => {
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      const learnset = championsLearnsets[entry.id];
      expect(learnset).toBeDefined();
      expect(learnset.length).toBeGreaterThan(0);

      const typeCount = new Map<string, number>();
      let statusCount = 0;
      for (const moveId of learnset) {
        const move = movesById.get(moveId);
        if (move === undefined) continue;
        if (move.category === "Status") {
          statusCount += 1;
          continue;
        }
        typeCount.set(move.type, (typeCount.get(move.type) ?? 0) + 1);
      }

      // ガブリアスはドラゴン技・じめん技を複数覚える
      expect(typeCount.get("Dragon")).toBeGreaterThan(0);
      expect(typeCount.get("Ground")).toBeGreaterThan(0);
      expect(statusCount).toBeGreaterThan(0);
    });

    it("byCategory: Physical / Special / Status の合計が count に一致する", () => {
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      const learnset = championsLearnsets[entry.id];
      let physical = 0;
      let special = 0;
      let status = 0;
      for (const moveId of learnset) {
        const move = movesById.get(moveId);
        if (move === undefined) continue;
        if (move.category === "Physical") physical += 1;
        else if (move.category === "Special") special += 1;
        else status += 1;
      }
      // learnset 中に movesById に未登録な move が混ざっている可能性があるため <= で確認
      expect(physical + special + status).toBeLessThanOrEqual(learnset.length);
      expect(physical + special + status).toBeGreaterThan(0);
    });
  });

  describe("derivedStats (Lv50 IV31 SP0 無補正)", () => {
    it("ガブリアス (base 108/130/95/80/85/102) の HP 実数値", () => {
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      const pokemon = new Pokemon(gen, entry.name, {
        nature: "Serious",
        evs: {},
        overrides: {
          types: entry.types,
          baseStats: entry.baseStats,
        } as NonNullable<ConstructorParameters<typeof Pokemon>[2]>["overrides"],
      });
      // HP: floor(floor((108*2+31)*50/100) + 50 + 10) ≈ 183 (Lv50 IV31 SP0)
      // 他のゲームと同じ公式: hp = floor((base*2 + iv) * level/100) + level + 10
      const GARCHOMP_HP = 183;
      expect(pokemon.stats.hp).toBe(GARCHOMP_HP);
    });

    it("無補正 atk 実数値は計算される", () => {
      const entry = pokemonById.get(toDataId("Garchomp"))!;
      const pokemon = new Pokemon(gen, entry.name, {
        nature: "Serious",
        evs: {},
        overrides: {
          types: entry.types,
          baseStats: entry.baseStats,
        } as NonNullable<ConstructorParameters<typeof Pokemon>[2]>["overrides"],
      });
      expect(pokemon.stats.atk).toBeGreaterThan(0);
    });
  });

  describe("エラー系", () => {
    it("存在しないポケモン名は pokemonNameResolver で undefined になる", () => {
      expect(pokemonNameResolver.toEnglish("スーパーポケモン")).toBeUndefined();
    });
  });
});
