import { describe, it, expect } from "vitest";
import { MAX_MOVES_PER_MEMBER } from "@ai-rotom/shared";
import { CORE_INSTRUCTIONS, PARTY_STORAGE_INSTRUCTIONS } from "@ai-rotom/mcp-core";
import { REMOTE_SERVER_INSTRUCTIONS } from "./instructions";

describe("REMOTE_SERVER_INSTRUCTIONS", () => {
  it("共通部分に続けてリモート版の使い方を案内する", () => {
    expect(REMOTE_SERVER_INSTRUCTIONS.startsWith(CORE_INSTRUCTIONS)).toBe(true);
    expect(REMOTE_SERVER_INSTRUCTIONS).toContain("## リモート版での使い方");
  });

  it("パーティ保存系のツールを案内しない", () => {
    expect(REMOTE_SERVER_INSTRUCTIONS).not.toContain(PARTY_STORAGE_INSTRUCTIONS);
    expect(REMOTE_SERVER_INSTRUCTIONS).not.toContain("save_party");
  });

  it("技構成を受け取る全技系ツールすべてで moves の指定を求める", () => {
    const sectionStart = REMOTE_SERVER_INSTRUCTIONS.indexOf("### 技構成を指定して計算する");
    expect(sectionStart).toBeGreaterThanOrEqual(0);
    const section = REMOTE_SERVER_INSTRUCTIONS.slice(sectionStart);

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
});
