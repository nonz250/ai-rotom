import { describe, it, expect } from "vitest";
import { calculate, Generations, Pokemon, Move, Field } from "@smogon/calc";

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
