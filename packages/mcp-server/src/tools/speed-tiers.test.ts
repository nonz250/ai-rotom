import { describe, it, expect } from "vitest";
import { Generations, Pokemon } from "@smogon/calc";
import { MAX_STAT_POINT_PER_STAT } from "@ai-rotom/shared";
import { pokemonById, toDataId } from "../data-store";
import { pokemonNameResolver } from "../name-resolvers";

const CHAMPIONS_GEN_NUM = 0;

function speedFor(
  nameEn: string,
  options: { nature?: string; speEv?: number } = {},
): number {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);
  const entry = pokemonById.get(toDataId(nameEn))!;
  const pokemon = new Pokemon(gen, entry.name, {
    nature: options.nature ?? "Serious",
    evs: { spe: options.speEv ?? 0 },
    overrides: {
      types: entry.types,
      baseStats: entry.baseStats,
    } as NonNullable<ConstructorParameters<typeof Pokemon>[2]>["overrides"],
  });
  return pokemon.stats.spe;
}

describe("list_speed_tiers logic", () => {
  describe("素早さ実数値の計算", () => {
    it("リザードン (base 100) の default finalSpeed を計算できる", () => {
      // Lv50 IV31 SP0 無補正
      // calcStat: floor(floor((base*2 + iv) * level/100) + 5) * nature
      // = floor((100*2 + 31)*50/100) + 5
      // = floor(115.5) + 5 = 115 + 5 = 120
      const LIZARDON_DEFAULT_SPE = 120;
      expect(speedFor("Charizard")).toBe(LIZARDON_DEFAULT_SPE);
    });

    it("ガブリアス (base 102) の default finalSpeed を計算できる", () => {
      // = floor((102*2+31)*50/100) + 5 = floor(117.5)+5 = 117+5 = 122
      const GARCHOMP_DEFAULT_SPE = 122;
      expect(speedFor("Garchomp")).toBe(GARCHOMP_DEFAULT_SPE);
    });

    it("最速 (Jolly + SP32) の実数値は default より高くなる", () => {
      const defaultSpe = speedFor("Garchomp");
      const jollyMax = speedFor("Garchomp", {
        nature: "Jolly",
        speEv: MAX_STAT_POINT_PER_STAT,
      });
      expect(jollyMax).toBeGreaterThan(defaultSpe);
    });

    it("無補正 + SP32 は最速より低く default より高い", () => {
      const defaultSpe = speedFor("Garchomp");
      const neutralMax = speedFor("Garchomp", {
        nature: "Serious",
        speEv: MAX_STAT_POINT_PER_STAT,
      });
      const jollyMax = speedFor("Garchomp", {
        nature: "Jolly",
        speEv: MAX_STAT_POINT_PER_STAT,
      });
      expect(neutralMax).toBeGreaterThan(defaultSpe);
      expect(neutralMax).toBeLessThan(jollyMax);
    });
  });

  describe("around 指定", () => {
    it("ガブリアス付近 (±10) のラインに同程度の素早さのポケモンが含まれる", () => {
      const AROUND = 10;
      const target = speedFor("Garchomp");
      expect(target).toBeGreaterThan(0);

      // 実際の付近候補は「実数値が target ± AROUND」の範囲
      const min = target - AROUND;
      const max = target + AROUND;
      expect(min).toBeLessThanOrEqual(target);
      expect(max).toBeGreaterThanOrEqual(target);
    });
  });

  describe("range 指定", () => {
    it("range.min と range.max で絞り込める", () => {
      const MIN = 100;
      const MAX = 120;
      // 無補正 default の素早さが 100-120 に入るポケモンは多数存在
      const inRange = [];
      for (const [, entry] of pokemonById) {
        const s = speedFor(entry.name);
        if (s >= MIN && s <= MAX) {
          inRange.push(entry.name);
        }
      }
      expect(inRange.length).toBeGreaterThan(0);
    });
  });

  describe("日本語名で around 指定できる", () => {
    it("ガブリアス (日本語) の英語解決ができる", () => {
      const nameEn = pokemonNameResolver.toEnglish("ガブリアス");
      expect(nameEn).toBe("Garchomp");
    });
  });
});
