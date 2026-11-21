import { describe, it, expect } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDamageCalculationTools } from "./damage-calculation";

type ToolHandler = (args: unknown) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

function captureHandler(toolName: string): ToolHandler {
  const handlers = new Map<string, ToolHandler>();
  const mockServer = {
    tool: (
      name: string,
      _description: string,
      _schema: unknown,
      handler: ToolHandler,
    ) => {
      handlers.set(name, handler);
      return {} as never;
    },
  } as unknown as McpServer;
  registerDamageCalculationTools(mockServer);
  const handler = handlers.get(toolName);
  if (handler === undefined) {
    throw new Error(`${toolName} handler was not registered.`);
  }
  return handler;
}

describe("calculate_damage_party_matchup の出力", () => {
  it("技構成がすべて無効な相手も、ダメージなしとして結果に残す", async () => {
    const res = await captureHandler("calculate_damage_party_matchup")({
      myParty: [{ name: "カイリキー", moves: ["インファイト", "ばくれつパンチ"] }],
      opponentParty: [{ name: "ゲンガー" }, { name: "カビゴン" }],
    });
    const output = JSON.parse(res.content[0].text);
    const results = output.matchups[0].results;

    expect(results.map((r: { defender: string }) => r.defender)).toEqual([
      "Gengar",
      "Snorlax",
    ]);
    expect(results[0]).toMatchObject({
      defenderNameJa: "ゲンガー",
      bestMove: null,
      bestMoveJa: null,
      maxDamagePercent: 0,
      koChance: null,
    });
  });
});

describe("calculate_damage_all_moves の出力", () => {
  it("技ごとの結果は要約形式で、乱数配列と説明文を含まない", async () => {
    const res = await captureHandler("calculate_damage_all_moves")({
      attacker: { name: "ガブリアス", moves: ["じしん", "げきりん"] },
      defender: { name: "サーフゴー" },
    });
    const output = JSON.parse(res.content[0].text);
    const earthquake = output.results.find(
      (r: { move: string }) => r.move === "Earthquake",
    );

    expect(earthquake.moveJa).toBe("じしん");
    expect(earthquake).not.toHaveProperty("damage");
    expect(earthquake).not.toHaveProperty("description");
    expect(earthquake).toHaveProperty("koChance");
  });
});
