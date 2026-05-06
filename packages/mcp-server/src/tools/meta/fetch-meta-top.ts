import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchMetaTop } from "../../services/pokedb-client.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "fetch_meta_top";
const TOOL_DESCRIPTION =
  "Pokemon Champions の環境上位ランキングを pokedb.tokyo から取得する。採用率順に並んだ N 体のリストを返す。構築相談・メタ分析の起点として最初に呼ぶこと。結果は 24h ディスクキャッシュされる。";

const inputSchema = {
  n: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe("取得件数 (1-200, デフォルト 50)"),
  format: z
    .enum(["single", "double"])
    .default("single")
    .describe("シングル / ダブル"),
};

export function registerFetchMetaTopTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const top = await fetchMetaTop(args.n, args.format);
      return withHint({
        type: "text" as const,
        text: JSON.stringify({ count: top.length, entries: top }),
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}
