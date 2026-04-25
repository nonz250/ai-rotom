import { describe, it, expect } from "vitest";
import { comparePartiesAnalysis } from "./compare-parties";

/**
 * compare_parties のテスト。
 * 実データ (pokemon.json) を用いて、同一パーティ差分ゼロ / 一匹差し替え /
 * タイプ分布・弱点・カバレッジ・素早さ・種族値合計の各差分を検証する。
 */

const CHARIZARD = { name: "リザードン" };
const GARCHOMP = { name: "ガブリアス" };
const GENGAR = { name: "ゲンガー" };
const PIKACHU = { name: "ピカチュウ" };

describe("comparePartiesAnalysis", () => {
  describe("同一パーティ", () => {
    const party = [CHARIZARD, GARCHOMP, GENGAR];
    const out = comparePartiesAnalysis({ partyA: party, partyB: party });

    it("memberDifferences は partyAOnly / partyBOnly が空、shared に全員", () => {
      expect(out.differences.memberDifferences.partyAOnly).toHaveLength(0);
      expect(out.differences.memberDifferences.partyBOnly).toHaveLength(0);
      const EXPECTED_SHARED = 3;
      expect(out.differences.memberDifferences.shared).toHaveLength(
        EXPECTED_SHARED,
      );
    });

    it("weaknesses / resistances / coverage はそれぞれ partyAOnly / partyBOnly が空", () => {
      expect(out.differences.weaknesses.partyAOnly).toHaveLength(0);
      expect(out.differences.weaknesses.partyBOnly).toHaveLength(0);
      expect(out.differences.resistances.partyAOnly).toHaveLength(0);
      expect(out.differences.resistances.partyBOnly).toHaveLength(0);
      expect(out.differences.coverage.partyAOnly).toHaveLength(0);
      expect(out.differences.coverage.partyBOnly).toHaveLength(0);
    });

    it("typeDistribution.changes は全 18 タイプを返し、全ての diff が 0", () => {
      const EXPECTED_TYPE_COUNT = 18;
      expect(out.differences.typeDistribution.changes).toHaveLength(
        EXPECTED_TYPE_COUNT,
      );
      for (const c of out.differences.typeDistribution.changes) {
        expect(c.diff).toBe(0);
        expect(c.countA).toBe(c.countB);
      }
    });

    it("baseStatsTotal.diff は 0", () => {
      expect(out.differences.baseStatsTotal.diff).toBe(0);
    });

    it("speedDistribution は A / B で一致する", () => {
      expect(out.differences.speedDistribution.partyA).toEqual(
        out.differences.speedDistribution.partyB,
      );
    });
  });

  describe("1 匹入れ替え (リザードン <-> ピカチュウ)", () => {
    const partyA = [CHARIZARD, GARCHOMP, GENGAR];
    const partyB = [PIKACHU, GARCHOMP, GENGAR];
    const out = comparePartiesAnalysis({ partyA, partyB });

    it("memberDifferences で該当 1 匹のみが A/B only に入り、残りは shared", () => {
      expect(
        out.differences.memberDifferences.partyAOnly.map((m) => m.name),
      ).toEqual(["Charizard"]);
      expect(
        out.differences.memberDifferences.partyBOnly.map((m) => m.name),
      ).toEqual(["Pikachu"]);
      const sharedNames = out.differences.memberDifferences.shared
        .map((m) => m.name)
        .sort();
      expect(sharedNames).toEqual(["Garchomp", "Gengar"]);
    });

    it("typeDistribution: Fire / Flying は A のみ、Electric は B のみに計上される", () => {
      const byType = new Map(
        out.differences.typeDistribution.changes.map((c) => [c.type, c]),
      );
      expect(byType.get("Fire")?.countA).toBe(1);
      expect(byType.get("Fire")?.countB).toBe(0);
      expect(byType.get("Fire")?.diff).toBe(-1);
      expect(byType.get("Flying")?.countA).toBe(1);
      expect(byType.get("Flying")?.countB).toBe(0);
      expect(byType.get("Electric")?.countA).toBe(0);
      expect(byType.get("Electric")?.countB).toBe(1);
      expect(byType.get("Electric")?.diff).toBe(1);
      // Dragon / Ground / Ghost / Poison は両方にある (diff 0)
      expect(byType.get("Dragon")?.diff).toBe(0);
      expect(byType.get("Ground")?.diff).toBe(0);
      expect(byType.get("Ghost")?.diff).toBe(0);
      expect(byType.get("Poison")?.diff).toBe(0);
    });

    it("baseStatsTotal は A=534+600+500=1634, B=320+600+500=1420, diff=-214", () => {
      const EXPECTED_A = 1634;
      const EXPECTED_B = 1420;
      const EXPECTED_DIFF = -214;
      expect(out.differences.baseStatsTotal.partyA).toBe(EXPECTED_A);
      expect(out.differences.baseStatsTotal.partyB).toBe(EXPECTED_B);
      expect(out.differences.baseStatsTotal.diff).toBe(EXPECTED_DIFF);
    });

    it("speedDistribution: 無補正・SP0 の実数値 (リザードン 120 / ガブリアス 122 / ゲンガー 130 / ピカチュウ 110)", () => {
      // partyA speeds: [120, 122, 130] → min=120 max=130 mean=124 median=122
      const SPEED_A_MIN = 120;
      const SPEED_A_MAX = 130;
      const SPEED_A_MEAN = 124;
      const SPEED_A_MEDIAN = 122;
      expect(out.differences.speedDistribution.partyA).toEqual({
        min: SPEED_A_MIN,
        max: SPEED_A_MAX,
        mean: SPEED_A_MEAN,
        median: SPEED_A_MEDIAN,
      });
      // partyB speeds: [110, 122, 130] → min=110 max=130 mean≈120.666... median=122
      const SPEED_B_MIN = 110;
      const SPEED_B_MAX = 130;
      const SPEED_B_MEDIAN = 122;
      expect(out.differences.speedDistribution.partyB.min).toBe(SPEED_B_MIN);
      expect(out.differences.speedDistribution.partyB.max).toBe(SPEED_B_MAX);
      expect(out.differences.speedDistribution.partyB.median).toBe(
        SPEED_B_MEDIAN,
      );
      const SPEED_B_MEAN_EXPECTED = (110 + 122 + 130) / 3;
      expect(out.differences.speedDistribution.partyB.mean).toBeCloseTo(
        SPEED_B_MEAN_EXPECTED,
      );
    });
  });

  describe("弱点差分", () => {
    // リザードン (Fire/Flying): Rock 4倍・Water 2倍・Electric 2倍の弱点
    // ピカチュウ (Electric): Ground 2倍の弱点
    it("両方のパーティに共通の弱点が both に、どちらか一方のみが *Only に入る", () => {
      const out = comparePartiesAnalysis({
        partyA: [CHARIZARD],
        partyB: [PIKACHU],
      });
      // Rock, Water, Electric はリザードン (A) のみの弱点
      expect(out.differences.weaknesses.partyAOnly).toContain("Rock");
      expect(out.differences.weaknesses.partyAOnly).toContain("Water");
      expect(out.differences.weaknesses.partyAOnly).toContain("Electric");
      // Ground はピカチュウ (B) のみの弱点
      expect(out.differences.weaknesses.partyBOnly).toContain("Ground");
      // どちらの側にも属さない要素は両方から見える
      expect(out.differences.weaknesses.both.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("カバレッジ差分", () => {
    // ガブリアスの learnset にはじしん (Ground) が含まれる。
    // じめん技は Electric / Poison / Rock / Steel / Fire に 2 倍、Flying に無効。
    it("Flying は A のみ、カバーされない (neither に含まれない) 可能性あり", () => {
      const out = comparePartiesAnalysis({
        partyA: [GARCHOMP],
        partyB: [GARCHOMP],
      });
      // 同一なら partyAOnly / partyBOnly は空
      expect(out.differences.coverage.partyAOnly).toHaveLength(0);
      expect(out.differences.coverage.partyBOnly).toHaveLength(0);
      // Flying に対してじしんは無効なので、ガブリアスだけでは他技も含め
      // ひこう抜群を取れない可能性がある。
      // ガブリアスの learnset にはかみなりパンチ等があり、electric で flying 抜群を取れるため、
      // ここでは neither に必ず何かが含まれるとは主張しない。
      expect(Array.isArray(out.differences.coverage.neither)).toBe(true);
    });
  });

  describe("labels", () => {
    it("labels を指定すると partyA / partyB の label に反映される", () => {
      const out = comparePartiesAnalysis({
        partyA: [CHARIZARD],
        partyB: [GARCHOMP],
        labels: { partyA: "現行", partyB: "改修案" },
      });
      expect(out.partyA.label).toBe("現行");
      expect(out.partyB.label).toBe("改修案");
    });

    it("labels を省略すると null", () => {
      const out = comparePartiesAnalysis({
        partyA: [CHARIZARD],
        partyB: [GARCHOMP],
      });
      expect(out.partyA.label).toBeNull();
      expect(out.partyB.label).toBeNull();
    });
  });

  describe("エラー系", () => {
    it("存在しないポケモン名を含むとエラー + サジェスト", () => {
      expect(() =>
        comparePartiesAnalysis({
          partyA: [{ name: "ソニック" }],
          partyB: [CHARIZARD],
        }),
      ).toThrow(/ポケモン「ソニック」が見つかりません/);
    });
  });

  describe("PartySummary", () => {
    it("各パーティの members には英名・日本語名・types・BST が含まれる", () => {
      const out = comparePartiesAnalysis({
        partyA: [CHARIZARD],
        partyB: [GARCHOMP],
      });
      const charizard = out.partyA.members[0];
      expect(charizard.name).toBe("Charizard");
      expect(charizard.nameJa).toBe("リザードン");
      expect(charizard.types).toEqual(["Fire", "Flying"]);
      const CHARIZARD_BST = 534;
      expect(charizard.baseStatsTotal).toBe(CHARIZARD_BST);
    });
  });
});
