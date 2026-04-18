import { describe, it, expect } from "vitest";
import { championsConditions } from "../../data-store";

describe("get_condition_info logic", () => {
  describe("データ取得", () => {
    it("weather に はれ・あめ・すなあらし などが含まれる", () => {
      const names = championsConditions.weather.map((c) => c.nameJa);
      expect(names).toContain("はれ");
      expect(names).toContain("あめ");
      expect(names).toContain("すなあらし");
    });

    it("terrain にエレキフィールドが含まれる", () => {
      const electric = championsConditions.terrain.find(
        (c) => c.id === "electric",
      );
      expect(electric).toBeDefined();
      expect(electric!.nameJa).toBe("エレキフィールド");
    });

    it("status にやけど・どく・まひが含まれる", () => {
      const names = championsConditions.status.map((c) => c.nameJa);
      expect(names).toContain("やけど");
      expect(names).toContain("どく");
      expect(names).toContain("まひ");
    });

    it("sideCondition にリフレクター・ひかりのかべ・オーロラベールが含まれる", () => {
      const names = championsConditions.sideCondition.map((c) => c.nameJa);
      expect(names).toContain("リフレクター");
      expect(names).toContain("ひかりのかべ");
      expect(names).toContain("オーロラベール");
    });
  });

  describe("全カテゴリの件数", () => {
    it("天候は 1 件以上", () => {
      expect(championsConditions.weather.length).toBeGreaterThan(0);
    });

    it("フィールドは 4 種類", () => {
      const TERRAIN_COUNT = 4;
      expect(championsConditions.terrain).toHaveLength(TERRAIN_COUNT);
    });

    it("状態異常は 6 種類", () => {
      const STATUS_COUNT = 6;
      expect(championsConditions.status).toHaveLength(STATUS_COUNT);
    });
  });

  describe("名前での絞り込み", () => {
    it("英語名（大文字小文字無視）で引ける", () => {
      const entry = championsConditions.weather.find(
        (c) => c.name.toLowerCase() === "sun",
      );
      expect(entry).toBeDefined();
      expect(entry!.nameJa).toBe("はれ");
    });

    it("日本語名で引ける", () => {
      const entry = championsConditions.status.find(
        (c) => c.nameJa === "ねむり",
      );
      expect(entry).toBeDefined();
      expect(entry!.id).toBe("slp");
    });
  });
});
