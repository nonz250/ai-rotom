import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchTypicalSet } from "../../services/pokedb-client.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "fetch_typical_set";
const TOOL_DESCRIPTION =
  "個別ポケモンの主流型サマリ (主要性格・主流技 6 個・主流持ち物 4 個・メガ進化情報) を採用率の分布から自動判別して返す。メガ進化候補が複数ある場合は採用率 20% 以上のものを全て列挙する (リザードンならメガリザY + メガリザX)。Phase 1 で「○○の主流型」を語る前に必ず呼ぶ。";

const inputSchema = {
  species: z.string().describe("ポケモン名 (日本語、pokedb 表記)"),
  format: z
    .enum(["single", "double"])
    .default("single")
    .describe("シングル / ダブル"),
};

export function registerFetchTypicalSetTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const set = await fetchTypicalSet(args.species, args.format);
      return withHint({
        type: "text" as const,
        text: JSON.stringify(set),
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}
