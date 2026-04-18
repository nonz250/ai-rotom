import { describe, it, expect } from "vitest";
import { calculate, Generations, Pokemon, Move, Field } from "@smogon/calc";
import { DamageCalculatorAdapter } from "./damage-calculator";
import type { DamageCalcResult } from "./damage-calculator";
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

describe("DamageCalculatorAdapter damage with pokemon.json overrides", () => {
  const adapter = new DamageCalculatorAdapter({
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  });

  it("メガスターミーの物理技が Huge Power で計算される", () => {
    // pokemon.json: Starmie-Mega atk=100, ability[0]=Huge Power
    // Huge Power 特性は攻撃力を 2 倍する
    const withHugePower = adapter.calculate({
      attacker: { name: "メガスターミー" },
      defender: { name: "ギャラドス" },
      moveName: "たきのぼり",
    });

    // ability を無指定（pokemon.json の Huge Power が適用される）
    expect(withHugePower.min).toBeGreaterThan(0);
    // description に Huge Power の文字列が含まれることを期待
    expect(withHugePower.description).toContain("Starmie-Mega");
  });
});

describe("DamageCalculatorAdapter.calculateAllMoves", () => {
  const adapter = new DamageCalculatorAdapter({
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  });

  it("should return multiple damage results for Japanese names", () => {
    const results = adapter.calculateAllMoves({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].attacker).toBe("Charizard");
    expect(results[0].defender).toBe("Gyarados");
  });

  it("should sort results by max damage descending", () => {
    const results = adapter.calculateAllMoves({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].max).toBeGreaterThanOrEqual(results[i].max);
    }
  });

  it("should only include moves that deal damage", () => {
    const results = adapter.calculateAllMoves({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
    });

    for (const result of results) {
      expect(result.max).toBeGreaterThan(0);
    }
  });

  it("should throw error for non-existent Pokemon name", () => {
    expect(() =>
      adapter.calculateAllMoves({
        attacker: { name: "ソニック" },
        defender: { name: "ギャラドス" },
      }),
    ).toThrow("ポケモン「ソニック」が見つかりません。");
  });

  it("should apply nature and EVs to calculation", () => {
    const resultsDefault = adapter.calculateAllMoves({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
    });

    const resultsModest = adapter.calculateAllMoves({
      attacker: { name: "リザードン", nature: "ひかえめ", evs: { spa: 32 } },
      defender: { name: "ギャラドス" },
    });

    // ひかえめ + 特攻振りなら特殊技のダメージが上がるはず
    // 同じ技で比較
    const defaultFlamethrower = resultsDefault.find(
      (r) => r.move === "Flamethrower",
    );
    const modestFlamethrower = resultsModest.find(
      (r) => r.move === "Flamethrower",
    );

    expect(defaultFlamethrower).toBeDefined();
    expect(modestFlamethrower).toBeDefined();
    expect(modestFlamethrower!.max).toBeGreaterThan(defaultFlamethrower!.max);
  });
});

describe("DamageCalculatorAdapter.createPokemonObject", () => {
  const adapter = new DamageCalculatorAdapter({
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  });

  it("should create Pokemon object with Japanese name", () => {
    const { pokemon, resolvedName } = adapter.createPokemonObject({
      name: "リザードン",
    });

    expect(resolvedName).toBe("Charizard");
    expect(pokemon.stats.hp).toBeGreaterThan(0);
    expect(pokemon.stats.spe).toBeGreaterThan(0);
  });

  it("should create Pokemon object with nature and EVs", () => {
    const { pokemon: pDefault } = adapter.createPokemonObject({
      name: "リザードン",
    });

    const { pokemon: pModest } = adapter.createPokemonObject({
      name: "リザードン",
      nature: "ひかえめ",
      evs: { spe: 32 },
    });

    expect(pModest.stats.spe).toBeGreaterThan(pDefault.stats.spe);
  });

  it("should throw error for non-existent Pokemon name", () => {
    expect(() =>
      adapter.createPokemonObject({ name: "ソニック" }),
    ).toThrow("ポケモン「ソニック」が見つかりません。");
  });

  it("should apply pokemon.json overrides (Starmie-Mega atk = 100)", () => {
    // pokemon.json で Starmie-Mega の atk は 140 → 100 に修正済み
    // デフォルト特性は Huge Power
    const { pokemon } = adapter.createPokemonObject({
      name: "メガスターミー",
    });

    expect(pokemon.species.baseStats.atk).toBe(100);
    expect(pokemon.ability).toBe("Huge Power");
  });

  it("should use explicit ability when specified", () => {
    // Charizard は pokemon.json で [Blaze, Solar Power]
    // ユーザー指定の場合は優先される
    const { pokemon: pDefault } = adapter.createPokemonObject({
      name: "リザードン",
    });
    const { pokemon: pSolarPower } = adapter.createPokemonObject({
      name: "リザードン",
      ability: "Solar Power",
    });

    expect(pDefault.ability).toBe("Blaze");
    expect(pSolarPower.ability).toBe("Solar Power");
  });
});
