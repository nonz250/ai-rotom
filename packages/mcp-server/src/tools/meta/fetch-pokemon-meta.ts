import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchPokemonMeta } from "../../services/pokedb-client.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "fetch_pokemon_meta";
const TOOL_DESCRIPTION =
  "個別ポケモンの採用率データ (技 / 持ち物 / 特性 / 性格 / よく並ぶポケモン) を pokedb.tokyo から取得する。「○○型が多い」「最近よく見る」のような環境主張は必ずこのツールで根拠データを取ってから書くこと。結果は 24h ディスクキャッシュされる。";

const inputSchema = {
  species: z
    .string()
    .describe("ポケモン名 (日本語、pokedb 表記)。例: ガブリアス / メガリザードンY"),
  format: z
    .enum(["single", "double"])
    .default("single")
    .describe("シングル / ダブル"),
};

export function registerFetchPokemonMetaTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const meta = await fetchPokemonMeta(args.species, args.format);
      return withHint({
        type: "text" as const,
        text: JSON.stringify({ species: args.species, ...meta }),
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}
