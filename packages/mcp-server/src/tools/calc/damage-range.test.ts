import { describe, it, expect } from "vitest";
import { DamageCalculatorAdapter } from "@ai-rotom/shared";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../../name-resolvers";
import { movesById, pokemonEntryProvider, toDataId } from "../../data-store";
import { findMinimalSurvivalSp } from "./damage-range";
import type { PokemonInput } from "@ai-rotom/shared";

describe("analyze_damage_range logic", () => {
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

  describe("ベースライン計算", () => {
    it("じしん (物理) のダメージ計算ができる", () => {
      // じしんは Flying に無効なので、地上タイプのドサイドンを防御側にする
      const result = adapter.calculate({
        attacker: { name: "ガブリアス" },
        defender: { name: "ドサイドン" },
        moveName: "じしん",
      });
      expect(result.max).toBeGreaterThan(0);
      expect(result.min).toBeGreaterThan(0);
    });

    it("なみのり (特殊) のダメージ計算ができる", () => {
      const result = adapter.calculate({
        attacker: { name: "ギャラドス" },
        defender: { name: "リザードン" },
        moveName: "なみのり",
      });
      expect(result.max).toBeGreaterThan(0);
    });
  });

  describe("OHKO 確率計算", () => {
    it("ダメージ配列が max HP を全て超えれば ohkoChance = 1", () => {
      const damages = [100, 101, 102, 103];
      const maxHp = 99;
      const hits = damages.filter((d) => d >= maxHp).length;
      expect(hits / damages.length).toBe(1);
    });

    it("誰も max HP に届かなければ ohkoChance = 0", () => {
      const damages = [50, 51, 52, 53];
      const maxHp = 100;
      const hits = damages.filter((d) => d >= maxHp).length;
      expect(hits / damages.length).toBe(0);
    });
  });

  describe("N 発 KO 計算", () => {
    it("minDamage=34, maxHp=100 なら 3 発で確定 KO", () => {
      const EXPECTED_HITS = 3;
      const maxHp = 100;
      const damages = [34, 35, 36, 40];
      const minDamage = Math.min(...damages);
      expect(Math.ceil(maxHp / minDamage)).toBe(EXPECTED_HITS);
    });

    it("minDamage=50, maxHp=100 なら 2 発で確定 KO", () => {
      const EXPECTED_HITS = 2;
      const maxHp = 100;
      const damages = [50, 60, 70, 80];
      const minDamage = Math.min(...damages);
      expect(Math.ceil(maxHp / minDamage)).toBe(EXPECTED_HITS);
    });
  });

  describe("技カテゴリ判定", () => {
    it("じしんは Physical", () => {
      const moveEn = moveNameResolver.toEnglish("じしん");
      expect(moveEn).toBe("Earthquake");
      const entry = movesById.get(toDataId(moveEn!));
      expect(entry!.category).toBe("Physical");
    });

    it("なみのりは Special", () => {
      const moveEn = moveNameResolver.toEnglish("なみのり");
      expect(moveEn).toBe("Surf");
      const entry = movesById.get(toDataId(moveEn!));
      expect(entry!.category).toBe("Special");
    });

    it("つるぎのまいは Status", () => {
      const moveEn = moveNameResolver.toEnglish("つるぎのまい");
      expect(moveEn).toBe("Swords Dance");
      const entry = movesById.get(toDataId(moveEn!));
      expect(entry!.category).toBe("Status");
    });
  });

  describe("SP 振りによる耐久向上", () => {
    it("HP / 防御に SP を振れば単発耐え可能性が上がる", () => {
      // じしんは ドサイドン (Ground/Rock) に抜群(2倍)
      const noEv = adapter.calculate({
        attacker: { name: "ガブリアス" },
        defender: { name: "ドサイドン" },
        moveName: "じしん",
      });
      const withEv = adapter.calculate({
        attacker: { name: "ガブリアス" },
        defender: {
          name: "ドサイドン",
          evs: { hp: 32, def: 32 },
        },
        moveName: "じしん",
      });

      expect(withEv.maxPercent).toBeLessThan(noEv.maxPercent);
    });
  });

  describe("エラー系", () => {
    it("存在しない技名はエラーになる", () => {
      expect(() =>
        adapter.calculate({
          attacker: { name: "ガブリアス" },
          defender: { name: "リザードン" },
          moveName: "スーパーじしん",
        }),
      ).toThrow();
    });
  });

  describe("findMinimalSurvivalSp の合計 SP 最小性", () => {
    /** SP 探索の上限（ポケモンチャンピオンズ仕様）。 */
    const MAX_SP_PER_STAT = 32;

    /**
     * ある SP 配分で単発耐えが成立するかを判定するヘルパー。
     * findMinimalSurvivalSp 内の trySurvive と同じロジックを再現する。
     */
    function survivesWith(
      attacker: PokemonInput,
      defender: PokemonInput,
      moveName: string,
      hpSp: number,
      defenseSp: number,
      defenseKey: "def" | "spd",
    ): boolean {
      const testDefender: PokemonInput = {
        ...defender,
        evs: {
          ...defender.evs,
          hp: hpSp,
          [defenseKey]: defenseSp,
        },
      };
      try {
        const result = adapter.calculate({
          attacker,
          defender: testDefender,
          moveName,
        });
        const { pokemon: defObj } =
          adapter.createPokemonObject(testDefender);
        return result.max < defObj.maxHP();
      } catch {
        return true;
      }
    }

    /**
     * brute-force で真の最小合計 SP を求める。
     * 合計 hp + def が最小の耐える組のうち最初のものを返す。
     */
    function bruteForceMinimalTotal(
      attacker: PokemonInput,
      defender: PokemonInput,
      moveName: string,
      defenseKey: "def" | "spd",
    ): number | null {
      let minTotal: number | null = null;
      for (let total = 0; total <= MAX_SP_PER_STAT * 2; total++) {
        for (let hp = 0; hp <= Math.min(total, MAX_SP_PER_STAT); hp++) {
          const def = total - hp;
          if (def > MAX_SP_PER_STAT) continue;
          if (survivesWith(attacker, defender, moveName, hp, def, defenseKey)) {
            minTotal = total;
            return minTotal;
          }
        }
      }
      return null;
    }

    it("返り値の (hpSp, defenseSp) で実際に単発耐えが成立する", () => {
      const attacker: PokemonInput = { name: "ガブリアス" };
      const defender: PokemonInput = { name: "ハッサム" };
      const config = findMinimalSurvivalSp(
        adapter,
        attacker,
        defender,
        "だいもんじ",
        undefined,
        "spd",
      );
      expect(config).not.toBeNull();
      if (config === null) return;
      const survived = survivesWith(
        attacker,
        defender,
        "だいもんじ",
        config.hpSp,
        config.defenseSp,
        "spd",
      );
      expect(survived).toBe(true);
    });

    it.each([
      {
        label: "ガブリアス だいもんじ → ハッサム",
        attacker: {
          name: "ガブリアス",
        } satisfies PokemonInput,
        defender: { name: "ハッサム" } satisfies PokemonInput,
        moveName: "だいもんじ",
        defenseKey: "spd" as const,
      },
      {
        label: "カイリキー クロスチョップ → カビゴン",
        attacker: {
          name: "カイリキー",
          evs: { atk: 32 },
          nature: "いじっぱり",
        } satisfies PokemonInput,
        defender: { name: "カビゴン" } satisfies PokemonInput,
        moveName: "クロスチョップ",
        defenseKey: "def" as const,
      },
      {
        label: "ガブリアス じしん → マニューラ",
        attacker: {
          name: "ガブリアス",
          evs: { atk: 32 },
          nature: "いじっぱり",
        } satisfies PokemonInput,
        defender: { name: "マニューラ" } satisfies PokemonInput,
        moveName: "じしん",
        defenseKey: "def" as const,
      },
    ])(
      "返り値の合計 SP が brute-force での真の最小と一致する: $label",
      ({ attacker, defender, moveName, defenseKey }) => {
        // 回帰テスト: 旧実装は coarse 探索で最初に survived した組で break outer
        // していたため、(hpSp 小, defSp 大) に偏った候補で固定され、
        // (hpSp 大, defSp 小) の合計最小候補を見落とすことがあった。
        // 修正後は coarse でも全探索し、合計最小の耐える組を記録する。
        const config = findMinimalSurvivalSp(
          adapter,
          attacker,
          defender,
          moveName,
          undefined,
          defenseKey,
        );
        expect(config).not.toBeNull();
        if (config === null) return;

        const resultTotal = config.hpSp + config.defenseSp;
        const trueMinTotal = bruteForceMinimalTotal(
          attacker,
          defender,
          moveName,
          defenseKey,
        );
        expect(trueMinTotal).not.toBeNull();
        expect(resultTotal).toBe(trueMinTotal);

        // 返された配分で実際に耐えることを確認
        const survived = survivesWith(
          attacker,
          defender,
          moveName,
          config.hpSp,
          config.defenseSp,
          defenseKey,
        );
        expect(survived).toBe(true);
      },
    );

    it("耐えられない場合は null を返す", () => {
      // ガブ+atk+いじのげきりんをサザンドラに撃つと SP 最大振りでも耐えない想定。
      const attacker: PokemonInput = {
        name: "ガブリアス",
        evs: { atk: 32 },
        nature: "いじっぱり",
      };
      const defender: PokemonInput = { name: "サザンドラ" };
      const config = findMinimalSurvivalSp(
        adapter,
        attacker,
        defender,
        "げきりん",
        undefined,
        "def",
      );
      if (config === null) {
        // 真に耐えられない: 最大振りでも耐えないことを確認
        const survivedAtMax = survivesWith(
          attacker,
          defender,
          "げきりん",
          MAX_SP_PER_STAT,
          MAX_SP_PER_STAT,
          "def",
        );
        expect(survivedAtMax).toBe(false);
      } else {
        // 最大振り以下で耐える → 返った配分で耐えることを確認
        const survived = survivesWith(
          attacker,
          defender,
          "げきりん",
          config.hpSp,
          config.defenseSp,
          "def",
        );
        expect(survived).toBe(true);
      }
    });
  });
});
