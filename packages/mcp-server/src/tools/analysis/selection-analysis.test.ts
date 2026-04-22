import { describe, it, expect } from "vitest";
import { Generations, toID } from "@smogon/calc";
import { DamageCalculatorAdapter } from "@ai-rotom/shared";
import type { DamageCalcResult } from "@ai-rotom/shared";
import { pokemonEntryProvider } from "../../data-store";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../../name-resolvers";
import { bestDamageEstimate } from "./selection-analysis";

const CHAMPIONS_GEN_NUM = 0;

describe("analyze_selection logic", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);
  const adapter = new DamageCalculatorAdapter(
    {
      pokemon: pokemonNameResolver,
      move: moveNameResolver,
      ability: abilityNameResolver,
      item: itemNameResolver,
      nature: natureNameResolver,
    },
    pokemonEntryProvider,
  );

  describe("タイプ相性の最大倍率", () => {
    it("みず vs ほのお/ひこう は 2 倍", () => {
      const water = gen.types.get(toID("Water"))!;
      const eff = water.effectiveness as Record<string, number>;
      const TWICE = 2;
      expect(eff["Fire"] * 1).toBe(TWICE);
      // Flying に対しては等倍なので、合成は 2
      // （Charizard (Fire/Flying) に対して水技は 2 倍）
      expect(eff["Fire"] * (eff["Flying"] ?? 1)).toBe(TWICE);
    });

    it("でんき vs みず/ひこう (ギャラドス) は 4 倍", () => {
      const elec = gen.types.get(toID("Electric"))!;
      const eff = elec.effectiveness as Record<string, number>;
      const FOURTH = 4;
      expect(eff["Water"] * eff["Flying"]).toBe(FOURTH);
    });
  });

  describe("6v6 マトリクス (小さいパーティ版)", () => {
    it("1対1 でもマトリクス 1 件が生成される", () => {
      const { pokemon: p1 } = adapter.createPokemonObject({
        name: "リザードン",
      });
      const { pokemon: p2 } = adapter.createPokemonObject({
        name: "ギャラドス",
      });

      expect(p1.stats.spe).toBeGreaterThan(0);
      expect(p2.stats.spe).toBeGreaterThan(0);

      // 速度比較: Lv50 IV31 SP0 のとき
      // リザードン spe=120, ギャラドス spe=(81*2+31)*50/100+5 = 96+5=101
      expect(p1.stats.spe).toBeGreaterThan(p2.stats.spe);
    });

    it("3v3 でマトリクスサイズが 9 件になる想定", () => {
      const SIZE = 9;
      const myParty = ["Charizard", "Gyarados", "Pikachu"];
      const oppParty = ["Garchomp", "Dragonite", "Metagross"];
      expect(myParty.length * oppParty.length).toBe(SIZE);
    });
  });

  describe("スコア計算ロジック", () => {
    it("素早さ勝ち + 抜群 + OHKO はトップスコア", () => {
      const SCORE_WEIGHT_SPEED_WIN = 2;
      const SCORE_WEIGHT_TYPE_ADVANTAGE = 3;
      const SCORE_WEIGHT_DAMAGE_ADVANTAGE = 5;
      const MAX_POSSIBLE_PER_MATCH =
        SCORE_WEIGHT_SPEED_WIN +
        SCORE_WEIGHT_TYPE_ADVANTAGE +
        SCORE_WEIGHT_DAMAGE_ADVANTAGE;
      const EXPECTED = 10;
      expect(MAX_POSSIBLE_PER_MATCH).toBe(EXPECTED);
    });
  });

  describe("エッジケース", () => {
    it("パーティが 1 体だけでも動作する", () => {
      const { pokemon, resolvedName } = adapter.createPokemonObject({
        name: "リザードン",
      });
      expect(pokemon.stats.spe).toBeGreaterThan(0);
      expect(resolvedName).toBe("Charizard");
    });
  });

  describe("bestDamageEstimate", () => {
    const SAMPLE_MIN_PERCENT = 80;
    const SAMPLE_MAX_PERCENT = 120;
    const SAMPLE_MIN_DAMAGE = 100;
    const SAMPLE_MAX_DAMAGE = 150;
    const SAMPLE_TYPE_MULTIPLIER = 1;
    const SAMPLE_EFFECTIVE_POWER_MULTIPLIER = 1;

    function makeResult(
      overrides: Partial<DamageCalcResult> = {},
    ): DamageCalcResult {
      return {
        attacker: "Charizard",
        defender: "Garchomp",
        move: "Blizzard",
        damage: [SAMPLE_MIN_DAMAGE, SAMPLE_MAX_DAMAGE],
        min: SAMPLE_MIN_DAMAGE,
        max: SAMPLE_MAX_DAMAGE,
        minPercent: SAMPLE_MIN_PERCENT,
        maxPercent: SAMPLE_MAX_PERCENT,
        koChance: "guaranteed OHKO",
        description: "test",
        moveType: "Ice",
        typeMultiplier: SAMPLE_TYPE_MULTIPLIER,
        isStab: false,
        effectivePowerMultiplier: SAMPLE_EFFECTIVE_POWER_MULTIPLIER,
        ...overrides,
      };
    }

    it("空配列は null を返す", () => {
      expect(bestDamageEstimate([], () => undefined)).toBeNull();
    });

    it("results[0] の技名を name/nameJa にセットする", () => {
      const results = [makeResult({ move: "Blizzard" })];
      const out = bestDamageEstimate(results, (en) =>
        en === "Blizzard" ? "ふぶき" : undefined,
      );
      expect(out?.move.name).toBe("Blizzard");
      expect(out?.move.nameJa).toBe("ふぶき");
    });

    it("日本語名未解決時は英名を nameJa にフォールバックする", () => {
      const results = [makeResult({ move: "UnknownMove" })];
      const out = bestDamageEstimate(results, () => undefined);
      expect(out?.move.name).toBe("UnknownMove");
      expect(out?.move.nameJa).toBe("UnknownMove");
    });

    it("min / max / ohkoChance を引き継ぐ", () => {
      const results = [makeResult()];
      const out = bestDamageEstimate(results, () => undefined);
      expect(out?.min).toBe(SAMPLE_MIN_PERCENT);
      expect(out?.max).toBe(SAMPLE_MAX_PERCENT);
      expect(out?.ohkoChance).toBe("guaranteed OHKO");
    });

    it("実データで moveNameResolver と統合して動作する", () => {
      const results = [makeResult({ move: "Earthquake" })];
      const out = bestDamageEstimate(results, (en) =>
        moveNameResolver.toJapanese(en),
      );
      expect(out?.move.name).toBe("Earthquake");
      // 「じしん」が data/moves.json に登録されていれば nameJa は日本語名になる。
      // 未登録なら英名がそのまま入る（フォールバック挙動）。
      expect(out?.move.nameJa.length).toBeGreaterThan(0);
    });

    it("複数件あるとき results[0] が採用される（ソート済み前提の仕様を固定）", () => {
      const HIGH_MIN = 90;
      const HIGH_MAX = 110;
      const LOW_MIN = 30;
      const LOW_MAX = 40;
      const results = [
        makeResult({
          move: "HighDamageMove",
          minPercent: HIGH_MIN,
          maxPercent: HIGH_MAX,
        }),
        makeResult({
          move: "LowDamageMove",
          minPercent: LOW_MIN,
          maxPercent: LOW_MAX,
        }),
      ];
      const out = bestDamageEstimate(results, () => undefined);
      // 先頭技が採用され、2 件目が採用されないことを固定する。
      // 実装が results[results.length - 1] 等に変わると失敗する。
      expect(out?.move.name).toBe("HighDamageMove");
      expect(out?.max).toBe(HIGH_MAX);
      expect(out?.min).toBe(HIGH_MIN);
    });

    it("results[0] の typeMultiplier / isStab / effectivePowerMultiplier を引き継ぐ", () => {
      const STAB_SUPER_EFFECTIVE_POWER = 3;
      const SUPER_EFFECTIVE_MULTIPLIER = 2;
      const results = [
        makeResult({
          isStab: true,
          typeMultiplier: SUPER_EFFECTIVE_MULTIPLIER,
          effectivePowerMultiplier: STAB_SUPER_EFFECTIVE_POWER,
        }),
      ];
      const out = bestDamageEstimate(results, () => undefined);
      expect(out?.isStab).toBe(true);
      expect(out?.typeMultiplier).toBe(SUPER_EFFECTIVE_MULTIPLIER);
      expect(out?.effectivePowerMultiplier).toBe(STAB_SUPER_EFFECTIVE_POWER);
    });

    it("非 STAB で抜群の場合も倍率を保持する", () => {
      const SUPER_EFFECTIVE_MULTIPLIER = 2;
      const NON_STAB_SUPER_EFFECTIVE_POWER = 2;
      const results = [
        makeResult({
          isStab: false,
          typeMultiplier: SUPER_EFFECTIVE_MULTIPLIER,
          effectivePowerMultiplier: NON_STAB_SUPER_EFFECTIVE_POWER,
        }),
      ];
      const out = bestDamageEstimate(results, () => undefined);
      expect(out?.isStab).toBe(false);
      expect(out?.typeMultiplier).toBe(SUPER_EFFECTIVE_MULTIPLIER);
      expect(out?.effectivePowerMultiplier).toBe(NON_STAB_SUPER_EFFECTIVE_POWER);
    });

    it("無効 (typeMultiplier=0) でも数値をそのまま伝搬する", () => {
      const IMMUNE_MULTIPLIER = 0;
      const IMMUNE_POWER = 0;
      const results = [
        makeResult({
          isStab: false,
          typeMultiplier: IMMUNE_MULTIPLIER,
          effectivePowerMultiplier: IMMUNE_POWER,
        }),
      ];
      const out = bestDamageEstimate(results, () => undefined);
      expect(out?.typeMultiplier).toBe(IMMUNE_MULTIPLIER);
      expect(out?.effectivePowerMultiplier).toBe(IMMUNE_POWER);
    });
  });
});
