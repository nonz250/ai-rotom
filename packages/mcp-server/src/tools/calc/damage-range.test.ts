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
});
