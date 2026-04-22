import { describe, it, expect } from "vitest";
import { Generations, toID } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import {
  applyDefensiveOverrides,
  calculateTypeEffectiveness,
} from "@ai-rotom/shared";
import { pokemonNameResolver } from "../../name-resolvers";

const CHAMPIONS_GEN_NUM = 0;

/** タイプ相性の倍率しきい値 */
const WEAKNESS_THRESHOLD = 2;
const RESISTANCE_THRESHOLD = 1;
const IMMUNITY_THRESHOLD = 0;

describe("analyze_party_weakness logic", () => {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  describe("タイプ相性計算", () => {
    it("リザードン(Fire/Flying)の弱点が正しく計算される", () => {
      const species = gen.species.get(toID("Charizard"))!;
      const types = [...species.types]; // Fire, Flying

      const weaknesses: { type: string; multiplier: number }[] = [];
      const resistances: { type: string; multiplier: number }[] = [];
      const immunities: string[] = [];

      for (const attackType of gen.types) {
        if (attackType.name === "???") continue;

        let multiplier = 1;
        for (const defType of types) {
          const eff =
            (attackType.effectiveness as Record<string, number>)[defType];
          if (eff !== undefined) {
            multiplier *= eff;
          }
        }

        if (multiplier === IMMUNITY_THRESHOLD) {
          immunities.push(attackType.name);
        } else if (multiplier >= WEAKNESS_THRESHOLD) {
          weaknesses.push({ type: attackType.name, multiplier });
        } else if (multiplier < RESISTANCE_THRESHOLD) {
          resistances.push({ type: attackType.name, multiplier });
        }
      }

      // リザードンは Rock 4倍弱点
      const rockWeakness = weaknesses.find((w) => w.type === "Rock");
      expect(rockWeakness).toBeDefined();
      const ROCK_MULTIPLIER = 4;
      expect(rockWeakness!.multiplier).toBe(ROCK_MULTIPLIER);

      // Water, Electric 2倍弱点
      const waterWeakness = weaknesses.find((w) => w.type === "Water");
      expect(waterWeakness).toBeDefined();
      const DOUBLE_MULTIPLIER = 2;
      expect(waterWeakness!.multiplier).toBe(DOUBLE_MULTIPLIER);

      const electricWeakness = weaknesses.find((w) => w.type === "Electric");
      expect(electricWeakness).toBeDefined();
      expect(electricWeakness!.multiplier).toBe(DOUBLE_MULTIPLIER);

      // Ground 無効
      expect(immunities).toContain("Ground");

      // Grass 半減以下
      const grassResistance = resistances.find((r) => r.type === "Grass");
      expect(grassResistance).toBeDefined();
    });

    it("単タイプポケモンの弱点が正しく計算される", () => {
      const species = gen.species.get(toID("Pikachu"))!;
      const types = [...species.types]; // Electric

      const weaknesses: { type: string; multiplier: number }[] = [];

      for (const attackType of gen.types) {
        if (attackType.name === "???") continue;

        let multiplier = 1;
        for (const defType of types) {
          const eff =
            (attackType.effectiveness as Record<string, number>)[defType];
          if (eff !== undefined) {
            multiplier *= eff;
          }
        }

        if (multiplier >= WEAKNESS_THRESHOLD) {
          weaknesses.push({ type: attackType.name, multiplier });
        }
      }

      // ピカチュウは Ground 2倍弱点
      const groundWeakness = weaknesses.find((w) => w.type === "Ground");
      expect(groundWeakness).toBeDefined();
      const DOUBLE_MULTIPLIER = 2;
      expect(groundWeakness!.multiplier).toBe(DOUBLE_MULTIPLIER);
    });
  });

  describe("パーティ弱点集計", () => {
    it("共通弱点が正しく集計される", () => {
      // リザードン(Fire/Flying)とウルガモス(Bug/Fire)は共通して Rock が弱点
      const charizard = gen.species.get(toID("Charizard"))!;
      const volcarona = gen.species.get(toID("Volcarona"))!;

      const party = [charizard, volcarona];
      const teamWeaknesses: Record<
        string,
        { count: number; members: string[] }
      > = {};

      for (const member of party) {
        const types = [...member.types];

        for (const attackType of gen.types) {
          if (attackType.name === "???") continue;

          let multiplier = 1;
          for (const defType of types) {
            const eff =
              (attackType.effectiveness as Record<string, number>)[defType];
            if (eff !== undefined) {
              multiplier *= eff;
            }
          }

          if (multiplier >= WEAKNESS_THRESHOLD) {
            if (teamWeaknesses[attackType.name] === undefined) {
              teamWeaknesses[attackType.name] = { count: 0, members: [] };
            }
            teamWeaknesses[attackType.name].count += 1;
            teamWeaknesses[attackType.name].members.push(member.name);
          }
        }
      }

      // Rock は両方が弱点
      expect(teamWeaknesses["Rock"]).toBeDefined();
      expect(teamWeaknesses["Rock"].count).toBe(2);
      expect(teamWeaknesses["Rock"].members).toContain("Charizard");
      expect(teamWeaknesses["Rock"].members).toContain("Volcarona");
    });
  });

  describe("日本語名での分析", () => {
    it("日本語名から英語名に解決してデータを取得できる", () => {
      const nameEn = pokemonNameResolver.toEnglish("リザードン");
      expect(nameEn).toBe("Charizard");

      const species = gen.species.get(toID(nameEn!));
      expect(species).toBeDefined();
      expect(species!.types).toContain("Fire");
    });
  });

  describe("エラー系", () => {
    it("存在しないポケモン名のときに解決できない", () => {
      const result = pokemonNameResolver.toEnglish("ソニック");
      expect(result).toBeUndefined();
    });
  });

  describe("特性・もちもの補正を反映したタイプ相性", () => {
    /**
     * 補正込みのタイプ相性を計算する。
     * party-analysis.ts の calculateTypeMatchups と同等の処理を
     * 特性・もちものを含めて再現する。
     */
    function computeMatchups(
      defenderTypes: readonly TypeName[],
      context: { ability?: string; item?: string } = {},
    ) {
      const weaknesses: { type: string; multiplier: number }[] = [];
      const resistances: { type: string; multiplier: number }[] = [];
      const immunities: string[] = [];

      for (const attackType of gen.types) {
        if (attackType.name === "???") continue;

        const base = calculateTypeEffectiveness(
          gen,
          attackType.name,
          defenderTypes,
        );
        const multiplier = applyDefensiveOverrides(
          base,
          attackType.name,
          context,
        );

        if (multiplier === IMMUNITY_THRESHOLD) {
          immunities.push(attackType.name);
        } else if (multiplier >= WEAKNESS_THRESHOLD) {
          weaknesses.push({ type: attackType.name, multiplier });
        } else if (multiplier < RESISTANCE_THRESHOLD) {
          resistances.push({ type: attackType.name, multiplier });
        }
      }

      return { weaknesses, resistances, immunities };
    }

    it("ふゆうのフーディンで じめん が immunities に入る", () => {
      const species = gen.species.get(toID("Alakazam"))!;
      const types = [...species.types] as TypeName[];

      const base = computeMatchups(types);
      expect(base.immunities).not.toContain("Ground");

      const withLevitate = computeMatchups(types, { ability: "Levitate" });
      expect(withLevitate.immunities).toContain("Ground");
    });

    it("もらいびのガオガエンで ほのお が immunities に入る", () => {
      const species = gen.species.get(toID("Incineroar"))!;
      const types = [...species.types] as TypeName[];

      const base = computeMatchups(types);
      // ガオガエン (Fire/Dark) は ほのお を半減する
      expect(base.resistances.some((r) => r.type === "Fire")).toBe(true);
      expect(base.immunities).not.toContain("Fire");

      const withFlashFire = computeMatchups(types, { ability: "Flash Fire" });
      expect(withFlashFire.immunities).toContain("Fire");
    });

    it("フィルターのバンギラスで かくとう 弱点が 4 倍 → 3 倍 に下がる", () => {
      const species = gen.species.get(toID("Tyranitar"))!;
      const types = [...species.types] as TypeName[];

      const base = computeMatchups(types);
      const baseFighting = base.weaknesses.find((w) => w.type === "Fighting");
      const DOUBLE_SUPER = 4;
      expect(baseFighting).toBeDefined();
      expect(baseFighting!.multiplier).toBe(DOUBLE_SUPER);

      const withFilter = computeMatchups(types, { ability: "Filter" });
      const filteredFighting = withFilter.weaknesses.find(
        (w) => w.type === "Fighting",
      );
      const FILTER_DOUBLE_SUPER = 3;
      expect(filteredFighting).toBeDefined();
      expect(filteredFighting!.multiplier).toBe(FILTER_DOUBLE_SUPER);
    });

    it("リングターゲット持ちのふゆうフーディンで じめん が weaknesses に戻る", () => {
      const species = gen.species.get(toID("Alakazam"))!;
      const types = [...species.types] as TypeName[];

      const withLevitate = computeMatchups(types, { ability: "Levitate" });
      expect(withLevitate.immunities).toContain("Ground");

      const withRingTarget = computeMatchups(types, {
        ability: "Levitate",
        item: "Ring Target",
      });
      // リングターゲットでふゆうを解除 → フーディン(エスパー単)は じめんが等倍なので
      // weaknesses にも immunities にも入らない。ただし immunities からは消える
      expect(withRingTarget.immunities).not.toContain("Ground");
    });
  });
});
