import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { warmMetaCache } from "../../services/pokedb-client.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "warm_meta_cache";
const TOOL_DESCRIPTION =
  "環境上位 N 体の採用率データを並列で事前取得して 24h キャッシュに格納する。構築相談やメタ分析の前に 1 回呼んでおくと、以降のメタ照会が即返る。pokedb.tokyo はレート制限なしなので並列で叩いてよい。";

const inputSchema = {
  depth: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe("事前取得する上位体数 (1-200, デフォルト 50)"),
  concurrency: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("並列度 (1-20, デフォルト 10)"),
};

export function registerWarmMetaCacheTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const result = await warmMetaCache(args.depth, args.concurrency);
      return withHint({
        type: "text" as const,
        text: JSON.stringify(result),
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}
