import { describe, it, expect } from "vitest";
import { filterResultsByLearnset } from "./learnset-filter";
import type { DamageCalcResult } from "../types";

function makeResult(move: string): DamageCalcResult {
  return {
    attacker: "A",
    defender: "D",
    move,
    damage: [1],
    min: 1,
    max: 1,
    minPercent: 1,
    maxPercent: 1,
    koChance: "",
    description: "",
  };
}

const toId = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "");

describe("filterResultsByLearnset", () => {
  it("learnset に含まれる技だけを返す", () => {
    const results = [
      makeResult("Ice Beam"),
      makeResult("Flamethrower"),
      makeResult("Earthquake"),
    ];
    const learnset = new Set(["icebeam", "earthquake"]);

    const filtered = filterResultsByLearnset(results, learnset, toId);

    expect(filtered.map((r) => r.move)).toEqual(["Ice Beam", "Earthquake"]);
  });

  it("learnsetMoveIds が空 Set の場合は元の配列をそのまま返す", () => {
    const results = [makeResult("Ice Beam"), makeResult("Flamethrower")];

    const filtered = filterResultsByLearnset(results, new Set(), toId);

    expect(filtered).toEqual(results);
    expect(filtered).not.toBe(results);
  });

  it("learnset に一致する技が 1 件も無ければ空配列を返す", () => {
    const results = [makeResult("Ice Beam"), makeResult("Flamethrower")];
    const learnset = new Set(["thunderbolt"]);

    const filtered = filterResultsByLearnset(results, learnset, toId);

    expect(filtered).toEqual([]);
  });

  it("normalize 関数で大文字混在・スペース入りの技名が正規化される", () => {
    const results = [
      makeResult("ICE BEAM"),
      makeResult("Flame-Thrower"),
    ];
    const learnset = new Set(["icebeam"]);

    const filtered = filterResultsByLearnset(results, learnset, toId);

    expect(filtered.map((r) => r.move)).toEqual(["ICE BEAM"]);
  });

  it("入力配列を破壊的変更しない", () => {
    const results = [makeResult("Ice Beam"), makeResult("Flamethrower")];
    const snapshot = [...results];

    filterResultsByLearnset(results, new Set(["icebeam"]), toId);

    expect(results).toEqual(snapshot);
  });

  it("results が空配列なら空配列を返す（learnset 空でも同様）", () => {
    expect(filterResultsByLearnset([], new Set(["icebeam"]), toId)).toEqual([]);
    expect(filterResultsByLearnset([], new Set(), toId)).toEqual([]);
  });

  it("normalize が identity 関数でも動作する", () => {
    const results = [makeResult("icebeam"), makeResult("flamethrower")];
    const learnset = new Set(["icebeam"]);

    const filtered = filterResultsByLearnset(
      results,
      learnset,
      (name) => name,
    );

    expect(filtered.map((r) => r.move)).toEqual(["icebeam"]);
  });
});
