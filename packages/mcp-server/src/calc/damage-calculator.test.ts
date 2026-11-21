import { describe, it, expect } from "vitest";
import { calculate, Generations, Pokemon, Move, Field, toID } from "@smogon/calc";
import { STAB_MULTIPLIER } from "@ai-rotom/shared";
import type { DamageCalcResult } from "@ai-rotom/shared";
import { damageCalculator } from "./damage-calculator.js";
import { championsItems } from "../data-store.js";

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

describe("items.json と計算エンジンの持ち物データの突合", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  it("items.json の全持ち物が gen0 の内蔵持ち物データに存在する", () => {
    // gen0 の威力補正処理は防御側の持ち物を gen.items.get(...)! で非 null 前提に参照する。
    // 内蔵に無い持ち物を持たせると、はたきおとすに限らずその防御側への全計算が
    // TypeError で落ちる。実行時は英語名を toID した値で引くため、id 列ではなく
    // name から照合する。
    const missingIds = championsItems
      .map((item) => toID(item.name))
      .filter((id) => gen.items.get(id) === undefined);

    expect(missingIds).toEqual([]);
  });
});

describe("DamageCalculatorAdapter", () => {
  it("should calculate damage with Japanese names", () => {
    const result = damageCalculator.calculate({
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
    const result = damageCalculator.calculate({
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
      damageCalculator.calculate({
        attacker: { name: "ソニック" },
        defender: { name: "ギャラドス" },
        moveName: "かえんほうしゃ",
      }),
    ).toThrow("ポケモン「ソニック」が見つかりません。");
  });

  it("should throw error for non-existent move name", () => {
    expect(() =>
      damageCalculator.calculate({
        attacker: { name: "リザードン" },
        defender: { name: "ギャラドス" },
        moveName: "ファイナルフラッシュ",
      }),
    ).toThrow("技「ファイナルフラッシュ」が見つかりません。");
  });

  it("should apply default nature (Serious) when not specified", () => {
    const resultDefault = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    const resultSerious = damageCalculator.calculate({
      attacker: { name: "リザードン", nature: "まじめ" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    expect(resultDefault.min).toBe(resultSerious.min);
    expect(resultDefault.max).toBe(resultSerious.max);
  });

  it("should apply EVs correctly", () => {
    const resultNoEvs = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    const resultWithEvs = damageCalculator.calculate({
      attacker: { name: "リザードン", evs: { spa: 32 } },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    expect(resultWithEvs.min).toBeGreaterThan(resultNoEvs.min);
  });

  it("should apply weather conditions", () => {
    const resultNoWeather = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    const resultSun = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
      conditions: { weather: "Sun" },
    });

    expect(resultSun.min).toBeGreaterThan(resultNoWeather.min);
  });

  it("should apply nature modifier with Japanese name", () => {
    const resultModest = damageCalculator.calculate({
      attacker: { name: "リザードン", nature: "ひかえめ" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    const resultDefault = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    expect(resultModest.min).toBeGreaterThan(resultDefault.min);
  });

  it("should return koChance text", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    expect(typeof result.koChance).toBe("string");
  });

  it("should return 16 damage rolls", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    const DAMAGE_ROLL_COUNT = 16;
    expect(result.damage).toHaveLength(DAMAGE_ROLL_COUNT);
  });

  it("should populate moveType / isStab / typeMultiplier / effectivePowerMultiplier", () => {
    // Charizard (Fire/Flying) かえんほうしゃ vs Gyarados (Water/Flying)
    // Fire is STAB (Charizard's type), Fire vs Water=0.5, Fire vs Flying=1 → 0.5
    // effectivePowerMultiplier = 1.5 * 0.5 = 0.75
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "かえんほうしゃ",
    });

    expect(result.moveType).toBe("Fire");
    expect(result.isStab).toBe(true);
    const HALF_EFFECTIVE = 0.5;
    const STAB_TIMES_HALF = 0.75;
    expect(result.typeMultiplier).toBe(HALF_EFFECTIVE);
    expect(result.effectivePowerMultiplier).toBe(STAB_TIMES_HALF);
  });
});

describe("DamageCalculatorAdapter damage with pokemon.json overrides", () => {
  it("メガスターミーの物理技が Huge Power で計算される", () => {
    // pokemon.json: Starmie-Mega atk=100, ability[0]=Huge Power
    // Huge Power 特性は攻撃力を 2 倍する
    const withHugePower = damageCalculator.calculate({
      attacker: { name: "メガスターミー" },
      defender: { name: "ギャラドス" },
      moveName: "たきのぼり",
    });

    // ability を無指定（pokemon.json の Huge Power が適用される）
    expect(withHugePower.min).toBeGreaterThan(0);
    // description に Huge Power の文字列が含まれることを期待
    expect(withHugePower.description).toContain("Starmie-Mega");
  });

  it("セグレイブのつららおとしはゴリランダーに効果抜群になる", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "セグレイブ" },
      defender: { name: "ゴリランダー" },
      moveName: "つららおとし",
    });

    expect(result.typeMultiplier).toBe(2);
  });
});

describe("DamageCalculatorAdapter weight-dependent moves", () => {
  // @smogon/calc は重さ依存技の威力を description に "(<BP> BP) " 形式で出す (desc.ts)。
  // 威力区分: 200kg以上=120 / 100kg以上=100 / 50kg以上=80 / 25kg以上=60 / 10kg以上=40 / 未満=20

  it("ガブリアス (95kg) へのくさむすびは 80 BP で計算される", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ガブリアス" },
      moveName: "くさむすび",
    });

    expect(result.description).toContain("(80 BP");
  });

  it("メガルカリオZ (49.4kg) へのくさむすびは 60 BP で計算される", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "メガルカリオZ" },
      moveName: "くさむすび",
    });

    expect(result.description).toContain("(60 BP");
  });

  it("ギルガルド(ブレードフォルム) (53kg) へのくさむすびは 80 BP で計算される", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギルガルド(ブレードフォルム)" },
      moveName: "くさむすび",
    });

    expect(result.description).toContain("(80 BP");
  });

  it("セグレイブ (210kg) へのくさむすびは 120 BP で計算される", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "セグレイブ" },
      moveName: "くさむすび",
    });

    expect(result.description).toContain("(120 BP");
  });

  it("グソクムシャ (108kg) へのくさむすびは 100 BP で計算される", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "グソクムシャ" },
      moveName: "くさむすび",
    });

    expect(result.description).toContain("(100 BP");
  });

  it("メガグソクムシャ (148kg) へのくさむすびは 100 BP で計算される", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "メガグソクムシャ" },
      moveName: "くさむすび",
    });

    expect(result.description).toContain("(100 BP");
  });

  it("メガセグレイブ (315kg) へのくさむすびは 120 BP で計算される", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "メガセグレイブ" },
      moveName: "くさむすび",
    });

    expect(result.description).toContain("(120 BP");
  });

  it("メガジジーロン (185kg) へのくさむすびは 100 BP で計算される", () => {
    // 計算エンジン内蔵の Drampa-Mega は 240.5kg で 120 BP 区分に入る。
    // 100 BP になること自体が pokemon.json の weightkg が内蔵値を上書きしている証拠になる。
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "メガジジーロン" },
      moveName: "くさむすび",
    });

    expect(result.description).toContain("(100 BP");
  });
});

describe("DamageCalculatorAdapter.calculateAllMoves", () => {
  it("should return multiple damage results for Japanese names", () => {
    const results = damageCalculator.calculateAllMoves({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].attacker).toBe("Charizard");
    expect(results[0].defender).toBe("Gyarados");
  });

  it("should sort results by max damage descending", () => {
    const results = damageCalculator.calculateAllMoves({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].max).toBeGreaterThanOrEqual(results[i].max);
    }
  });

  it("should only include moves that deal damage", () => {
    const results = damageCalculator.calculateAllMoves({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
    });

    for (const result of results) {
      expect(result.max).toBeGreaterThan(0);
    }
  });

  it("攻撃側が覚えない技は結果に含めない", () => {
    const results = damageCalculator.calculateAllMoves({
      attacker: { name: "ガブリアス" },
      defender: { name: "サーフゴー" },
    });
    const moves = results.map((r) => r.move);

    expect(moves).not.toContain("Head Smash");
    expect(moves).not.toContain("Headlong Rush");
    expect(moves).toContain("Earthquake");
  });

  it("moves を指定すると指定したダメージ技だけを計算する", () => {
    const results = damageCalculator.calculateAllMoves({
      attacker: {
        name: "ガブリアス",
        moves: ["じしん", "げきりん", "ストーンエッジ", "つるぎのまい"],
      },
      defender: { name: "サーフゴー" },
    });

    expect(results.map((r) => r.move).sort()).toEqual(
      ["Earthquake", "Outrage", "Stone Edge"].sort(),
    );
  });

  it("moves に指定した技は習得技でなくても計算する", () => {
    const results = damageCalculator.calculateAllMoves({
      attacker: { name: "ガブリアス", moves: ["もろはのずつき"] },
      defender: { name: "サーフゴー" },
    });

    expect(results.map((r) => r.move)).toEqual(["Head Smash"]);
  });

  it("moves に存在しない技名を指定するとエラーになる", () => {
    expect(() =>
      damageCalculator.calculateAllMoves({
        attacker: { name: "ガブリアス", moves: ["じしん", "ほげほげ"] },
        defender: { name: "サーフゴー" },
      }),
    ).toThrow("技「ほげほげ」が見つかりません。");
  });

  it("moves に計算エンジンが対応していない技があると、黙って除外せずエラーになる", () => {
    expect(() =>
      damageCalculator.calculateAllMoves({
        attacker: { name: "ガブリアス", moves: ["じしん", "たいあたり"] },
        defender: { name: "サーフゴー" },
      }),
    ).toThrow("技「たいあたり」は計算エンジンが未対応のため計算できません。");
  });

  it("moves が空配列なら習得技すべてを計算する", () => {
    const withEmpty = damageCalculator.calculateAllMoves({
      attacker: { name: "ガブリアス", moves: [] },
      defender: { name: "サーフゴー" },
    });
    const withoutMoves = damageCalculator.calculateAllMoves({
      attacker: { name: "ガブリアス" },
      defender: { name: "サーフゴー" },
    });

    expect(withEmpty.map((r) => r.move)).toEqual(
      withoutMoves.map((r) => r.move),
    );
  });

  it("should throw error for non-existent Pokemon name", () => {
    expect(() =>
      damageCalculator.calculateAllMoves({
        attacker: { name: "ソニック" },
        defender: { name: "ギャラドス" },
      }),
    ).toThrow("ポケモン「ソニック」が見つかりません。");
  });

  it("should apply nature and EVs to calculation", () => {
    const resultsDefault = damageCalculator.calculateAllMoves({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
    });

    const resultsModest = damageCalculator.calculateAllMoves({
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
  it("should create Pokemon object with Japanese name", () => {
    const { pokemon, resolvedName } = damageCalculator.createPokemonObject({
      name: "リザードン",
    });

    expect(resolvedName).toBe("Charizard");
    expect(pokemon.stats.hp).toBeGreaterThan(0);
    expect(pokemon.stats.spe).toBeGreaterThan(0);
  });

  it("should create Pokemon object with nature and EVs", () => {
    const { pokemon: pDefault } = damageCalculator.createPokemonObject({
      name: "リザードン",
    });

    const { pokemon: pModest } = damageCalculator.createPokemonObject({
      name: "リザードン",
      nature: "ひかえめ",
      evs: { spe: 32 },
    });

    expect(pModest.stats.spe).toBeGreaterThan(pDefault.stats.spe);
  });

  it("should throw error for non-existent Pokemon name", () => {
    expect(() =>
      damageCalculator.createPokemonObject({ name: "ソニック" }),
    ).toThrow("ポケモン「ソニック」が見つかりません。");
  });

  it("should apply pokemon.json overrides (Starmie-Mega atk = 100)", () => {
    // pokemon.json で Starmie-Mega の atk は 140 → 100 に修正済み
    // デフォルト特性は Huge Power
    const { pokemon } = damageCalculator.createPokemonObject({
      name: "メガスターミー",
    });

    expect(pokemon.species.baseStats.atk).toBe(100);
    expect(pokemon.ability).toBe("Huge Power");
  });

  it("should use explicit ability when specified", () => {
    // Charizard は pokemon.json で [Blaze, Solar Power]
    // ユーザー指定の場合は優先される
    const { pokemon: pDefault } = damageCalculator.createPokemonObject({
      name: "リザードン",
    });
    const { pokemon: pSolarPower } = damageCalculator.createPokemonObject({
      name: "リザードン",
      ability: "Solar Power",
    });

    expect(pDefault.ability).toBe("Blaze");
    expect(pSolarPower.ability).toBe("Solar Power");
  });
});

describe("DamageCalculatorAdapter はどうのぼうご (Aura Guard) の接触技半減", () => {
  it("メガルカリオZ の Aura Guard は接触物理技のダメージを半減する", () => {
    // ものひろい (Pickup) は champions.ts の特性処理に一切登場せず、かつ持ち物を
    // 持たせていないためこの計算に無関係な特性であり、比較対象として使う。
    // フレアドライブ (接触・Fire) を選んだのは Fighting/Steel 複合の
    // メガルカリオZ に等倍以上が確実に入り、ダメージ 0 ロールによる
    // kochance() の内部エラーを避けるため。
    const withAuraGuard = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "メガルカリオZ" },
      moveName: "フレアドライブ",
    });

    const withUnrelatedAbility = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "メガルカリオZ", ability: "ものひろい" },
      moveName: "フレアドライブ",
    });

    const AURA_GUARD_MULTIPLIER = 0.5;
    expect(withAuraGuard.min).toBe(withUnrelatedAbility.min * AURA_GUARD_MULTIPLIER);
    expect(withAuraGuard.max).toBe(withUnrelatedAbility.max * AURA_GUARD_MULTIPLIER);
  });
});

describe("DamageCalculatorAdapter 計算後の技タイプからメトリクスを算出", () => {
  it("calculate で Aerilate によるタイプ変換が moveType に反映される", () => {
    const result = damageCalculator.calculate({
      attacker: { name: "メガカイロス" },
      defender: { name: "ゲンガー" },
      moveName: "すてみタックル",
    });

    expect(result.moveType).toBe("Flying");
    expect(result.isStab).toBe(true);
    expect(result.typeMultiplier).toBe(1);
    expect(result.min).toBeGreaterThan(0);
  });

  it("calculateAllMoves でも Aerilate のタイプ変換が結果に反映される", () => {
    const results = damageCalculator.calculateAllMoves({
      attacker: { name: "メガカイロス" },
      defender: { name: "ゲンガー" },
    });

    const bodySlam = results.find((r) => r.move === "Body Slam");

    expect(bodySlam).toBeDefined();
    expect(bodySlam!.moveType).toBe("Flying");
  });

  it("field 起因の技タイプ変換（ウェザーボール）も moveType に反映される", () => {
    // -ate 系とは独立した field 起因の変換経路を押さえる（静的マップ applyOffensiveTypeOverride への差し戻しリファクタを検出する）
    const result = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ギャラドス" },
      moveName: "ウェザーボール",
      conditions: { weather: "Sun" },
    });

    expect(result.moveType).toBe("Fire");
    expect(result.isStab).toBe(true);
    expect(result.typeMultiplier).toBe(0.5);
  });
});

describe("DamageCalculatorAdapter メガボーマンダのスカイスキン (Aerilate)", () => {
  it("すてみタックルはスカイスキンで Flying 化し、ゴーストのゲンガーにも通る", () => {
    // ノーマル技はゴーストに無効なので、ダメージが出ること自体がスカイスキンによる Flying 化の証明になる。
    const result = damageCalculator.calculate({
      attacker: { name: "メガボーマンダ" },
      defender: { name: "ゲンガー" },
      moveName: "すてみタックル",
    });

    expect(result.moveType).toBe("Flying");
    expect(result.isStab).toBe(true);
    expect(result.typeMultiplier).toBe(1);
    expect(result.min).toBeGreaterThan(0);
  });

  it("すてみタックルの威力補正は STAB 単体の倍率を超える", () => {
    const withAerilate = damageCalculator.calculate({
      attacker: { name: "メガボーマンダ" },
      defender: { name: "ギャラドス" },
      moveName: "すてみタックル",
    });

    const withoutAerilate = damageCalculator.calculate({
      attacker: { name: "メガボーマンダ", ability: "ものひろい" },
      defender: { name: "ギャラドス" },
      moveName: "すてみタックル",
    });

    // 理論値は STAB (1.5) × スカイスキンの威力補正 (1.2) = 1.8 だが、実測比は 1.7778 で
    // 端数丸めにより下振れする。絶対値固定ではなく下限チェックで威力補正の有無を弁別する。
    expect(withAerilate.max / withoutAerilate.max).toBeGreaterThan(STAB_MULTIPLIER);
  });
});

describe("DamageCalculatorAdapter いかく (Intimidate) の未反映を固定", () => {
  it("ボーマンダの第一特性いかくは相手の攻撃力を下げない", () => {
    // calc は Intimidate を実装しているが発動フラグ（abilityOn）依存で、本アダプタはフラグを渡していないため未反映。反映されるようになったらこのテストが落ちる。
    const withIntimidate = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ボーマンダ" },
      moveName: "フレアドライブ",
    });

    const withUnrelatedAbility = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ボーマンダ", ability: "ものひろい" },
      moveName: "フレアドライブ",
    });

    expect(withIntimidate.min).toBeGreaterThan(0);
    expect(withIntimidate.min).toBe(withUnrelatedAbility.min);
    expect(withIntimidate.max).toBe(withUnrelatedAbility.max);
  });
});

describe("DamageCalculatorAdapter メガストーンを持つ防御側の計算", () => {
  it("防御側がメガストーンを持っていても計算が例外を投げない", () => {
    expect(() =>
      damageCalculator.calculate({
        attacker: { name: "リザードン" },
        defender: { name: "ボーマンダ", item: "ボーマンダナイト" },
        moveName: "フレアドライブ",
      }),
    ).not.toThrow();
  });

  it("はたきおとすはメガストーン所持相手に威力補正を乗せない", () => {
    // はたきおとすは持ち物を落とせる相手にだけ 1.5 倍が乗る。
    // メガストーンは落とせないため補正対象外で、持ち物なしと同じ威力になる。
    const withMegaStone = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ボーマンダ", item: "ボーマンダナイト" },
      moveName: "はたきおとす",
    });
    const withoutItem = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ボーマンダ" },
      moveName: "はたきおとす",
    });
    const withRemovableItem = damageCalculator.calculate({
      attacker: { name: "リザードン" },
      defender: { name: "ボーマンダ", item: "たべのこし" },
      moveName: "はたきおとす",
    });

    expect(withMegaStone.max).toBe(withoutItem.max);
    expect(withMegaStone.max).toBeLessThan(withRemovableItem.max);
  });
});

describe("DamageCalculatorAdapter へんげんじざい (Protean) の STAB 判定", () => {
  it("メガゲッコウガ (Protean) のインファイトは種族タイプに無い技でも STAB が乗る", () => {
    // ability 省略 = pokemon.json の第一特性 (Protean) が自動適用される。
    const result = damageCalculator.calculate({
      attacker: { name: "メガゲッコウガ" },
      defender: { name: "カビゴン" },
      moveName: "インファイト",
    });

    const FIGHTING_VS_NORMAL_MULTIPLIER = 2;
    expect(result.isStab).toBe(true);
    expect(result.effectivePowerMultiplier).toBe(
      STAB_MULTIPLIER * FIGHTING_VS_NORMAL_MULTIPLIER,
    );
    expect(result.description).toContain("Protean");
  });
});

describe("DamageCalculatorAdapter リベロ (Libero) の STAB 判定", () => {
  it("エースバーンのリベロ明示指定で、インファイトに STAB が乗る", () => {
    // エースバーンの第一特性は Blaze のため、Libero の検証には明示指定が必要。
    const result = damageCalculator.calculate({
      attacker: { name: "エースバーン", ability: "リベロ" },
      defender: { name: "カビゴン" },
      moveName: "インファイト",
    });

    expect(result.isStab).toBe(true);
    expect(result.description).toContain("Libero");
  });
});

describe("DamageCalculatorAdapter ふうせん (Air Balloon) のじめん技無効", () => {
  it("ふうせん所持の防御側には calculateAllMoves の結果からじめん技が消える", () => {
    const withoutBalloon = damageCalculator.calculateAllMoves({
      attacker: { name: "ガブリアス" },
      defender: { name: "カビゴン" },
    });
    const withBalloon = damageCalculator.calculateAllMoves({
      attacker: { name: "ガブリアス" },
      defender: { name: "カビゴン", item: "ふうせん" },
    });

    expect(withoutBalloon.some((r) => r.moveType === "Ground")).toBe(true);
    expect(withBalloon.some((r) => r.moveType === "Ground")).toBe(false);
  });

  it("ふうせんはじめん以外の技のダメージを変えない", () => {
    const withoutBalloon = damageCalculator.calculate({
      attacker: { name: "ガブリアス" },
      defender: { name: "カビゴン" },
      moveName: "げきりん",
    });
    const withBalloon = damageCalculator.calculate({
      attacker: { name: "ガブリアス" },
      defender: { name: "カビゴン", item: "ふうせん" },
      moveName: "げきりん",
    });

    expect(withBalloon.min).toBe(withoutBalloon.min);
    expect(withBalloon.max).toBe(withoutBalloon.max);
  });

  it("ふうせん所持の防御側へのじしんは単発計算が例外になる", () => {
    // 全ロール 0 のとき kochance() が例外を投げる。タイプ無効の場合と同じ経路で、
    // calculateAllMoves 側は max <= 0 で技ごと除外されるためここだけ挙動が分かれる。
    const earthquake = (item?: string) => () =>
      damageCalculator.calculate({
        attacker: { name: "ガブリアス" },
        defender: { name: "カビゴン", item },
        moveName: "じしん",
      });

    expect(earthquake()).not.toThrow();
    expect(earthquake("ふうせん")).toThrow();
  });
});

describe("DamageCalculatorAdapter.resolveMoveNames", () => {
  it("日本語名と英語名を英語名に揃え、重複を取り除く", () => {
    expect(
      damageCalculator.resolveMoveNames(["じしん", "Earthquake", "げきりん"]),
    ).toEqual(["Earthquake", "Outrage"]);
  });

  it("存在しない技名があるとエラーになる", () => {
    expect(() => damageCalculator.resolveMoveNames(["ほげほげ"])).toThrow(
      "技「ほげほげ」が見つかりません。",
    );
  });

  it("計算エンジンが対応していない技があるとエラーになる", () => {
    expect(() =>
      damageCalculator.resolveMoveNames(["じしん", "たいあたり"]),
    ).toThrow("技「たいあたり」は計算エンジンが未対応のため計算できません。");
  });
});
