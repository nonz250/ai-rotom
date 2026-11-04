import { describe, it, expect } from "vitest";
import { movesById, toDataId } from "../../data-store";
import { moveNameResolver } from "../../name-resolvers";

const FLAMETHROWER_BASE_POWER = 90;
const FLAMETHROWER_ACCURACY = 100;
const FLAMETHROWER_PP = 16;

describe("get_move_info logic", () => {
  describe("データ取得", () => {
    it("英語名から技データが取得できる", () => {
      const entry = movesById.get(toDataId("Flamethrower"));
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Flamethrower");
      expect(entry!.type).toBe("Fire");
      expect(entry!.category).toBe("Special");
      expect(entry!.basePower).toBe(FLAMETHROWER_BASE_POWER);
      expect(entry!.accuracy).toBe(FLAMETHROWER_ACCURACY);
      expect(entry!.pp).toBe(FLAMETHROWER_PP);
    });

    it("日本語名から英語名に解決できる", () => {
      const englishName = moveNameResolver.toEnglish("かえんほうしゃ");
      expect(englishName).toBe("Flamethrower");

      const entry = movesById.get(toDataId(englishName!));
      expect(entry).toBeDefined();
      expect(entry!.name).toBe("Flamethrower");
    });

    it("英語名から日本語名に逆引きできる", () => {
      const jaName = moveNameResolver.toJapanese("Flamethrower");
      expect(jaName).toBe("かえんほうしゃ");
    });

    it("必中技（accuracy: true）が保持される", () => {
      // 「とける」 (Acid Armor) は変化技で必中
      const entry = movesById.get(toDataId("Acid Armor"));
      expect(entry).toBeDefined();
      expect(entry!.category).toBe("Status");
      expect(entry!.accuracy).toBe(true);
    });
  });

  describe("存在しない技", () => {
    it("toEnglish で存在しない日本語名は undefined を返す", () => {
      const result = moveNameResolver.toEnglish("ないわざ");
      expect(result).toBeUndefined();
    });

    it("toDataId で存在しない ID は Map に無い", () => {
      const entry = movesById.get(toDataId("NoSuchMove"));
      expect(entry).toBeUndefined();
    });
  });

  describe("特殊ケース", () => {
    it("変化技は basePower が 0 のデータ構造になっている", () => {
      const entry = movesById.get(toDataId("Acid Armor"));
      expect(entry!.basePower).toBe(0);
      // 出力変換で null に変える前提
    });

    it("physical 技は basePower が正の値を持つ", () => {
      const entry = movesById.get(toDataId("Accelerock"));
      expect(entry!.category).toBe("Physical");
      expect(entry!.basePower).toBeGreaterThan(0);
    });
  });

  describe("追加した専用技 13 件", () => {
    // 件数が多いため table-driven に統一する
    it.each([
      { nameJa: "コートチェンジ", name: "Court Change", type: "Normal", category: "Status", basePower: 0, accuracy: 100, pp: 12 },
      { nameJa: "でんこうそうげき", name: "Double Shock", type: "Electric", category: "Physical", basePower: 120, accuracy: 100, pp: 8 },
      { nameJa: "ドラムアタック", name: "Drum Beating", type: "Grass", category: "Physical", basePower: 80, accuracy: 100, pp: 12 },
      { nameJa: "きょけんとつげき", name: "Glaive Rush", type: "Dragon", category: "Physical", basePower: 120, accuracy: 100, pp: 8 },
      { nameJa: "くらいつく", name: "Jaw Lock", type: "Dark", category: "Physical", basePower: 80, accuracy: 100, pp: 12 },
      { nameJa: "たこがため", name: "Octolock", type: "Fighting", category: "Status", basePower: 0, accuracy: 100, pp: 16 },
      { nameJa: "オーバードライブ", name: "Overdrive", type: "Electric", category: "Special", basePower: 80, accuracy: 100, pp: 12 },
      { nameJa: "かえんボール", name: "Pyro Ball", type: "Fire", category: "Physical", basePower: 120, accuracy: 90, pp: 8 },
      { nameJa: "さいきのいのり", name: "Revival Blessing", type: "Normal", category: "Status", basePower: 0, accuracy: true, pp: 1 },
      { nameJa: "ギアチェンジ", name: "Shift Gear", type: "Steel", category: "Status", basePower: 0, accuracy: true, pp: 12 },
      { nameJa: "きりさく", name: "Slash", type: "Normal", category: "Physical", basePower: 80, accuracy: 100, pp: 20 },
      { nameJa: "ねらいうち", name: "Snipe Shot", type: "Water", category: "Special", basePower: 85, accuracy: 100, pp: 16 },
      { nameJa: "びりびりちくちく", name: "Zing Zap", type: "Electric", category: "Physical", basePower: 80, accuracy: 100, pp: 12 },
    ])(
      "$nameJa（$name）が日英双方向で解決でき、type / category / basePower / accuracy / pp が取得できる",
      ({ nameJa, name, type, category, basePower, accuracy, pp }) => {
        expect(moveNameResolver.toEnglish(nameJa)).toBe(name);
        expect(moveNameResolver.toJapanese(name)).toBe(nameJa);

        const entry = movesById.get(toDataId(name));
        expect(entry).toBeDefined();
        expect(entry!.type).toBe(type);
        expect(entry!.category).toBe(category);
        expect(entry!.basePower).toBe(basePower);
        expect(entry!.accuracy).toBe(accuracy);
        expect(entry!.pp).toBe(pp);
      },
    );
  });

  describe("チャンピオンズで技の分類が変わった技", () => {
    it.each([
      { nameJa: "シャドークロー", flag: "slicing" },
      { nameJa: "ドラゴンクロー", flag: "slicing" },
      { nameJa: "ブレイククロー", flag: "slicing" },
      { nameJa: "フェイタルクロー", flag: "slicing" },
      { nameJa: "ドラゴンエール", flag: "sound" },
    ])("$nameJa は $flag フラグを持つ", ({ nameJa, flag }) => {
      const englishName = moveNameResolver.toEnglish(nameJa);
      expect(englishName).toBeDefined();

      const entry = movesById.get(toDataId(englishName!));
      expect(entry).toBeDefined();
      expect(entry!.flags).toContain(flag);
    });
  });
});
