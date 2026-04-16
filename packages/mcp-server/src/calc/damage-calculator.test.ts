import { describe, it, expect } from "vitest";
import { calculate, Generations, Pokemon, Move, Field } from "@smogon/calc";
import { DamageCalculatorAdapter } from "./damage-calculator";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../name-resolvers";

const CHAMPIONS_GEN_NUM = 0;

describe("@smogon/calc Champions integration", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  it("should load Champions generation", () => {
    expect(gen).toBeDefined();
  });

  it("should create a Pokemon", () => {
    const charizard = new Pokemon(gen, "Charizard");
    expect(charizard.name).toBe("Charizard");
    expect(charizard.types).toContain("Fire");
  });

  it("should create a Move", () => {
    const flamethrower = new Move(gen, "Flamethrower");
    expect(flamethrower.name).toBe("Flamethrower");
    expect(flamethrower.type).toBe("Fire");
  });

  it("should calculate damage for Charizard Flamethrower vs Gyarados", () => {
    const attacker = new Pokemon(gen, "Charizard", {
      nature: "Modest",
      evs: { spa: 32 },
    });
    const defender = new Pokemon(gen, "Gyarados");
    const move = new Move(gen, "Flamethrower");

    const result = calculate(gen, attacker, defender, move);
    const [min, max] = result.range();

    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThanOrEqual(min);
    expect(result.fullDesc()).toContain("Charizard");
    expect(result.fullDesc()).toContain("Gyarados");
  });

  it("should apply weather modifier", () => {
    const attacker = new Pokemon(gen, "Charizard", {
      nature: "Modest",
      evs: { spa: 32 },
    });
    const defender = new Pokemon(gen, "Gyarados");
    const move = new Move(gen, "Flamethrower");

    const resultNoWeather = calculate(gen, attacker, defender, move);
    const resultSun = calculate(
      gen,
      attacker,
      defender,
      move,
      new Field({ weather: "Sun" })
    );

    const [minNoWeather] = resultNoWeather.range();
    const [minSun] = resultSun.range();

    expect(minSun).toBeGreaterThan(minNoWeather);
  });

  it("should calculate with stat boosts", () => {
    const attacker = new Pokemon(gen, "Charizard", {
      nature: "Modest",
      evs: { spa: 32 },
      boosts: { spa: 1 },
    });
    const defender = new Pokemon(gen, "Gyarados");
    const move = new Move(gen, "Flamethrower");

    const attackerNoBoost = new Pokemon(gen, "Charizard", {
      nature: "Modest",
      evs: { spa: 32 },
    });

    const resultBoosted = calculate(gen, attacker, defender, move);
    const resultNormal = calculate(gen, attackerNoBoost, defender, move);

    const [minBoosted] = resultBoosted.range();
    const [minNormal] = resultNormal.range();

    expect(minBoosted).toBeGreaterThan(minNormal);
  });
});

describe("DamageCalculatorAdapter", () => {
  const adapter = new DamageCalculatorAdapter({
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  });

  it("should calculate damage with Japanese names", () => {
    const result = adapter.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    expect(result.attacker).toBe("Charizard");
    expect(result.defender).toBe("Gyarados");
    expect(result.move).toBe("Flamethrower");
    expect(result.damage.length).toBeGreaterThan(0);
    expect(result.min).toBeGreaterThan(0);
    expect(result.max).toBeGreaterThanOrEqual(result.min);
    expect(result.minPercent).toBeGreaterThan(0);
    expect(result.maxPercent).toBeGreaterThanOrEqual(result.minPercent);
    expect(result.description).toContain("Charizard");
    expect(result.description).toContain("Gyarados");
  });

  it("should calculate damage with English names", () => {
    const result = adapter.calculate({
      attacker: { name: "Charizard" },
      defender: { name: "Gyarados" },
      moveName: "Flamethrower",
    });

    expect(result.attacker).toBe("Charizard");
    expect(result.defender).toBe("Gyarados");
    expect(result.move).toBe("Flamethrower");
    expect(result.min).toBeGreaterThan(0);
  });

  it("should throw error for non-existent Pokemon name", () => {
    expect(() =>
      adapter.calculate({
        attacker: { name: "ソニック" },
        defender: { name: "ギャラドス" },
        moveName: "かえんほうしゃ",
      }),
    ).toThrow("ポケモン「ソニック」が見つかりません。");
  });

  it("should throw error for non-existent move name", () => {
    expect(() =>
      adapter.calculate({
        attacker: { name: "リザードン" },
        defender: { name: "ギャラドス" },
        moveName: "ファイナルフラッシュ",
      }),
    ).toThrow("技「ファイナルフラッシュ」が見つかりません。");
  });

  it("should apply default nature (Serious) when not specified", () => {
    const resultDefault = adapter.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    const resultSerious = adapter.calculate({
      attacker: { name: "リザードン", nature: "まじめ" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    expect(resultDefault.min).toBe(resultSerious.min);
    expect(resultDefault.max).toBe(resultSerious.max);
  });

  it("should apply EVs correctly", () => {
    const resultNoEvs = adapter.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    const resultWithEvs = adapter.calculate({
      attacker: { name: "リザードン", evs: { spa: 32 } },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    expect(resultWithEvs.min).toBeGreaterThan(resultNoEvs.min);
  });

  it("should apply weather conditions", () => {
    const resultNoWeather = adapter.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    const resultSun = adapter.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
      conditions: { weather: "Sun" },
    });

    expect(resultSun.min).toBeGreaterThan(resultNoWeather.min);
  });

  it("should apply nature modifier with Japanese name", () => {
    const resultModest = adapter.calculate({
      attacker: { name: "リザードン", nature: "ひかえめ" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    const resultDefault = adapter.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    expect(resultModest.min).toBeGreaterThan(resultDefault.min);
  });

  it("should return koChance text", () => {
    const result = adapter.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    expect(typeof result.koChance).toBe("string");
  });

  it("should return 16 damage rolls", () => {
    const result = adapter.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    const DAMAGE_ROLL_COUNT = 16;
    expect(result.damage).toHaveLength(DAMAGE_ROLL_COUNT);
  });
});
