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
});
