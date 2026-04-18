import { describe, it, expect } from "vitest";
import { Generations, toID } from "@smogon/calc";
import { championsTypes, typesById } from "../../data-store";

const CHAMPIONS_GEN_NUM = 0;

describe("get_type_info logic", () => {
  describe("データ取得", () => {
    it("types.json に 18 タイプが含まれる", () => {
      const POKEMON_TYPE_COUNT = 18;
      expect(championsTypes).toHaveLength(POKEMON_TYPE_COUNT);
    });

    it("英語名小文字から typesById で引ける", () => {
      const entry = typesById.get("fire");
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Fire");
      expect(entry!.nameJa).toBe("ほのお");
    });

    it("日本語名から該当エントリを検索できる", () => {
      const entry = championsTypes.find((t) => t.nameJa === "みず");
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Water");
    });
  });

  describe("攻撃時の相性", () => {
    it("ほのお→くさ は 2 倍", () => {
      const gen = Generations.get(CHAMPIONS_GEN_NUM);
      const fireType = gen.types.get(toID("Fire"))!;
      const effectiveness = fireType.effectiveness as Record<string, number>;
      const EFFECTIVE_MULTIPLIER = 2;
      expect(effectiveness["Grass"]).toBe(EFFECTIVE_MULTIPLIER);
    });

    it("みず→ほのお は 2 倍", () => {
      const gen = Generations.get(CHAMPIONS_GEN_NUM);
      const waterType = gen.types.get(toID("Water"))!;
      const effectiveness = waterType.effectiveness as Record<string, number>;
      const EFFECTIVE_MULTIPLIER = 2;
      expect(effectiveness["Fire"]).toBe(EFFECTIVE_MULTIPLIER);
    });

    it("でんき→じめん は 0 倍（無効）", () => {
      const gen = Generations.get(CHAMPIONS_GEN_NUM);
      const electricType = gen.types.get(toID("Electric"))!;
      const effectiveness = electricType.effectiveness as Record<
        string,
        number
      >;
      const IMMUNITY_MULTIPLIER = 0;
      expect(effectiveness["Ground"]).toBe(IMMUNITY_MULTIPLIER);
    });
  });

  describe("防御時の相性", () => {
    it("ほのおタイプは みず から 2 倍を受ける", () => {
      const gen = Generations.get(CHAMPIONS_GEN_NUM);
      const waterType = gen.types.get(toID("Water"))!;
      const effectiveness = waterType.effectiveness as Record<string, number>;
      const EFFECTIVE_MULTIPLIER = 2;
      expect(effectiveness["Fire"]).toBe(EFFECTIVE_MULTIPLIER);
    });
  });
});
