import { describe, it, expect } from "vitest";
import {
  MAX_STAT_POINT_PER_STAT,
  MAX_STAT_POINT_TOTAL,
} from "@ai-rotom/shared";
import { SERVER_INSTRUCTIONS } from "./instructions";

describe("SERVER_INSTRUCTIONS", () => {
  it("includes the per-stat stat point upper bound", () => {
    expect(SERVER_INSTRUCTIONS).toContain(String(MAX_STAT_POINT_PER_STAT));
  });

  it("includes the total stat point upper bound", () => {
    expect(SERVER_INSTRUCTIONS).toContain(String(MAX_STAT_POINT_TOTAL));
  });

  it("mentions the former EV naming so clients learn the spec change", () => {
    // AI クライアントが旧仕様 (EV/252/510) を流用しないよう、
    // instructions で明示的に旧名称との差異を伝えるという設計意図を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("EV");
    expect(SERVER_INSTRUCTIONS).toContain("252");
  });

  it("documents IV is fixed to 31", () => {
    expect(SERVER_INSTRUCTIONS).toContain("個体値");
    expect(SERVER_INSTRUCTIONS).toContain("31");
  });

  it("documents battle level 50", () => {
    expect(SERVER_INSTRUCTIONS).toContain("レベル");
    expect(SERVER_INSTRUCTIONS).toContain("50");
  });

  it("documents mega evolution once per battle", () => {
    expect(SERVER_INSTRUCTIONS).toContain("メガシンカ");
  });

  it("documents terastal not supported", () => {
    expect(SERVER_INSTRUCTIONS).toContain("テラスタル");
  });

  it("recommends specifying ability and item for calc / analysis tools", () => {
    // 計算・対面分析系ツールで ability / item の指定を推奨する方針を
    // instructions に明示し、AI クライアントが省略しがちな挙動を抑止する意図を固定化する。
    expect(SERVER_INSTRUCTIONS).toContain("ability");
    expect(SERVER_INSTRUCTIONS).toContain("item");
    expect(SERVER_INSTRUCTIONS).toContain("推奨");
  });

  it("no longer lists ability in the list of omissible fields", () => {
    // 旧表現「evs・nature・ability 等を省略してよい」から ability を外し、
    // evs / nature のみ省略許容であることを保証する。
    expect(SERVER_INSTRUCTIONS).not.toContain("evs・nature・ability");
  });
});
