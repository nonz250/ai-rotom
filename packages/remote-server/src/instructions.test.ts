import { describe, it, expect } from "vitest";
import { MAX_MOVES_PER_MEMBER } from "@ai-rotom/shared";
import { CORE_INSTRUCTIONS, PARTY_STORAGE_INSTRUCTIONS } from "@ai-rotom/mcp-core";
import { buildRemoteServerInstructions } from "./instructions";

const MOVES_SECTION_HEADING = "### 技構成を指定して計算する";

describe("buildRemoteServerInstructions", () => {
  it("共通部分に続けてリモート版の使い方を案内する", () => {
    for (const requireMoves of [true, false]) {
      const instructions = buildRemoteServerInstructions(requireMoves);
      expect(instructions.startsWith(CORE_INSTRUCTIONS)).toBe(true);
      expect(instructions).toContain("## リモート版での使い方");
    }
  });

  it("パーティ保存系のツールを案内しない", () => {
    for (const requireMoves of [true, false]) {
      const instructions = buildRemoteServerInstructions(requireMoves);
      expect(instructions).not.toContain(PARTY_STORAGE_INSTRUCTIONS);
      expect(instructions).not.toContain("save_party");
    }
  });

  it("技構成が必須なら、技構成を受け取る全技系ツールすべてで moves の指定を求める", () => {
    const instructions = buildRemoteServerInstructions(true);
    const sectionStart = instructions.indexOf(MOVES_SECTION_HEADING);
    expect(sectionStart).toBeGreaterThanOrEqual(0);
    const section = instructions.slice(sectionStart);

    for (const tool of [
      "calculate_damage_all_moves",
      "calculate_damage_party_matchup",
      "analyze_matchup",
      "analyze_selection",
    ]) {
      expect(section).toContain(tool);
    }
    expect(section).toContain("moves");
    expect(section).toContain(`${MAX_MOVES_PER_MEMBER} つまで`);
  });

  it("技構成が任意なら、技構成の指定を求めない", () => {
    expect(buildRemoteServerInstructions(false)).not.toContain(MOVES_SECTION_HEADING);
  });
});
