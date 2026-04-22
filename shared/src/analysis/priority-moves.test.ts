import { describe, it, expect } from "vitest";
import {
  extractPriorityMoves,
  type MoveInfoForPriority,
} from "./priority-moves";

const MOVES: Record<string, MoveInfoForPriority> = {
  quickattack: {
    name: "Quick Attack",
    nameJa: "でんこうせっか",
    priority: 1,
    category: "Physical",
  },
  extremespeed: {
    name: "Extreme Speed",
    nameJa: "しんそく",
    priority: 2,
    category: "Physical",
  },
  fakeout: {
    name: "Fake Out",
    nameJa: "ねこだまし",
    priority: 3,
    category: "Physical",
  },
  aquajet: {
    name: "Aqua Jet",
    nameJa: "アクアジェット",
    priority: 1,
    category: "Physical",
  },
  protect: {
    name: "Protect",
    nameJa: "まもる",
    priority: 4,
    category: "Status",
  },
  tackle: {
    name: "Tackle",
    nameJa: "たいあたり",
    priority: 0,
    category: "Physical",
  },
  thunderbolt: {
    name: "Thunderbolt",
    nameJa: "10まんボルト",
    priority: 0,
    category: "Special",
  },
  // nameJa が null の技（外部 API 未登録想定）
  mysteryshot: {
    name: "Mystery Shot",
    nameJa: null,
    priority: 1,
    category: "Physical",
  },
};

function makeResolveMove(): (id: string) => MoveInfoForPriority | undefined {
  return (id) => MOVES[id];
}

describe("extractPriorityMoves", () => {
  it("priority > 0 の技のみを抽出する", () => {
    const result = extractPriorityMoves({
      learnsetMoveIds: ["tackle", "quickattack", "thunderbolt"],
      resolveMove: makeResolveMove(),
      toJapanese: () => undefined,
    });

    expect(result).toHaveLength(1);
    expect(result[0].move).toBe("Quick Attack");
    expect(result[0].priority).toBe(1);
    expect(result[0].category).toBe("Physical");
  });

  it("priority 降順でソートされる", () => {
    const result = extractPriorityMoves({
      learnsetMoveIds: ["quickattack", "fakeout", "extremespeed", "protect"],
      resolveMove: makeResolveMove(),
      toJapanese: () => undefined,
    });

    expect(result.map((r) => r.priority)).toEqual([4, 3, 2, 1]);
    expect(result.map((r) => r.move)).toEqual([
      "Protect",
      "Fake Out",
      "Extreme Speed",
      "Quick Attack",
    ]);
  });

  it("priority が同値の場合は英名昇順で安定ソートする", () => {
    const result = extractPriorityMoves({
      learnsetMoveIds: ["quickattack", "aquajet"],
      resolveMove: makeResolveMove(),
      toJapanese: () => undefined,
    });

    expect(result.map((r) => r.move)).toEqual(["Aqua Jet", "Quick Attack"]);
  });

  it("先制技が無い場合は空配列を返す", () => {
    const result = extractPriorityMoves({
      learnsetMoveIds: ["tackle", "thunderbolt"],
      resolveMove: makeResolveMove(),
      toJapanese: () => undefined,
    });

    expect(result).toEqual([]);
  });

  it("learnsetMoveIds が空の場合は空配列を返す", () => {
    const result = extractPriorityMoves({
      learnsetMoveIds: [],
      resolveMove: makeResolveMove(),
      toJapanese: () => undefined,
    });

    expect(result).toEqual([]);
  });

  it("resolveMove が undefined を返した ID はスキップされる", () => {
    const result = extractPriorityMoves({
      learnsetMoveIds: ["quickattack", "unknownmove", "fakeout"],
      resolveMove: makeResolveMove(),
      toJapanese: () => undefined,
    });

    expect(result.map((r) => r.move)).toEqual(["Fake Out", "Quick Attack"]);
  });

  it("nameJa が null の技は toJapanese でフォールバックする", () => {
    const result = extractPriorityMoves({
      learnsetMoveIds: ["mysteryshot"],
      resolveMove: makeResolveMove(),
      toJapanese: (en) => (en === "Mystery Shot" ? "ミステリーショット" : undefined),
    });

    expect(result).toHaveLength(1);
    expect(result[0].moveJa).toBe("ミステリーショット");
  });

  it("nameJa も toJapanese も解決できない場合は英名をそのまま返す", () => {
    const result = extractPriorityMoves({
      learnsetMoveIds: ["mysteryshot"],
      resolveMove: makeResolveMove(),
      toJapanese: () => undefined,
    });

    expect(result).toHaveLength(1);
    expect(result[0].moveJa).toBe("Mystery Shot");
  });

  it("Status カテゴリの先制技（まもる等）も含まれる", () => {
    const result = extractPriorityMoves({
      learnsetMoveIds: ["protect", "quickattack"],
      resolveMove: makeResolveMove(),
      toJapanese: () => undefined,
    });

    expect(result[0]).toMatchObject({
      move: "Protect",
      category: "Status",
      priority: 4,
    });
  });
});
