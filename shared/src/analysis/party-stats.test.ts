import { describe, it, expect } from "vitest";
import { Generations } from "@smogon/calc";
import {
  baseStatsTotal,
  classifyPokemonTypeMatchups,
  collectPartyResistanceTypes,
  collectPartyWeaknessTypes,
  computeNumericStats,
} from "./party-stats";

const CHAMPIONS_GEN_NUM = 0;
const gen = Generations.get(CHAMPIONS_GEN_NUM);

describe("classifyPokemonTypeMatchups", () => {
  it("Fire/Flying (リザードン) は Rock 4倍弱点・Ground 無効・Grass 耐性を持つ", () => {
    const result = classifyPokemonTypeMatchups(["Fire", "Flying"], gen);

    const rock = result.weaknesses.find((w) => w.type === "Rock");
    const ROCK_MULT = 4;
    expect(rock?.multiplier).toBe(ROCK_MULT);

    expect(result.immunities).toContain("Ground");
    expect(result.resistances.some((r) => r.type === "Grass")).toBe(true);
  });

  it("Electric (ピカチュウ) は Ground 2倍弱点を持つ", () => {
    const result = classifyPokemonTypeMatchups(["Electric"], gen);
    const ground = result.weaknesses.find((w) => w.type === "Ground");
    const DOUBLE = 2;
    expect(ground?.multiplier).toBe(DOUBLE);
  });
});

describe("collectPartyWeaknessTypes", () => {
  it("Fire/Flying と Bug/Fire は共通して Rock を弱点として含む", () => {
    const set = collectPartyWeaknessTypes(
      [
        ["Fire", "Flying"],
        ["Bug", "Fire"],
      ],
      gen,
    );
    expect(set.has("Rock")).toBe(true);
  });

  it("単タイプのみでも弱点集合を返す", () => {
    const set = collectPartyWeaknessTypes([["Electric"]], gen);
    expect(set.has("Ground")).toBe(true);
  });
});

describe("collectPartyResistanceTypes", () => {
  it("Fire/Flying の耐性集合には Grass / Ground 等が含まれる", () => {
    const set = collectPartyResistanceTypes([["Fire", "Flying"]], gen);
    expect(set.has("Grass")).toBe(true);
    expect(set.has("Ground")).toBe(true);
  });
});

describe("computeNumericStats", () => {
  it("奇数長の中央値は中央要素、偶数長は 2 要素の平均", () => {
    expect(computeNumericStats([1, 2, 3])).toEqual({
      min: 1,
      max: 3,
      mean: 2,
      median: 2,
    });
    expect(computeNumericStats([1, 2, 3, 4])).toEqual({
      min: 1,
      max: 4,
      mean: 2.5,
      median: 2.5,
    });
  });

  it("空配列は全て 0", () => {
    expect(computeNumericStats([])).toEqual({
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
    });
  });

  it("未ソートでも結果は同じ", () => {
    const unsorted = computeNumericStats([5, 1, 4, 2, 3]);
    expect(unsorted).toEqual({ min: 1, max: 5, mean: 3, median: 3 });
  });
});

describe("baseStatsTotal", () => {
  it("6 ステータスの合計を返す", () => {
    const EXPECTED = 600;
    expect(
      baseStatsTotal({ hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }),
    ).toBe(EXPECTED);
  });
});
