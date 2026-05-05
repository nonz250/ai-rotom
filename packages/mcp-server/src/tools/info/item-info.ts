import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { itemsById, toDataId } from "../../data-store.js";
import { itemNameResolver } from "../../name-resolvers.js";
import { withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "get_item_info";
const TOOL_DESCRIPTION =
  "ポケモンの持ち物（アイテム）の詳細情報（効果説明、メガストーン情報）を取得する。ポケモンチャンピオンズで使える持ち物のみ返す。パーティ構築で持ち物を選ぶ際に使用する。";

const inputSchema = {
  name: z.string().describe("持ち物名（日本語 or 英語）"),
};

/**
 * get_item_info ツールの出力形式。
 * メガストーンの場合のみ megaStone が true となり、進化情報が埋まる。
 */
export interface ItemInfoOutput {
  name: string;
  nameJa: string | null;
  descEn: string;
  shortDescEn: string;
  megaStone: boolean;
  megaEvolvesPokemon: string | null;
  megaEvolvesInto: string | null;
}

/**
 * 持ち物名を英語に解決する。日本語名・英語名どちらでも受け付ける。
 */
function resolveItemNameEn(input: string): string {
  const fromJa = itemNameResolver.toEnglish(input);
  if (fromJa !== undefined) {
    return fromJa;
  }
  if (itemNameResolver.hasEnglishName(input)) {
    return input;
  }

  const suggestions = itemNameResolver.suggestSimilar(input);
  const suggestionMessage =
    suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
  throw new Error(`持ち物「${input}」が見つかりません。${suggestionMessage}`);
}

export function registerItemInfoTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const englishName = resolveItemNameEn(args.name);
      const itemId = toDataId(englishName);
      const entry = itemsById.get(itemId);

      if (entry === undefined) {
        throw new Error(
          `持ち物「${args.name}」はチャンピオンズでは使用できません。`,
        );
      }

      const isMegaStone = entry.megaStone !== null;

      const output: ItemInfoOutput = {
        name: entry.name,
        nameJa: entry.nameJa,
        descEn: entry.desc,
        shortDescEn: entry.shortDesc,
        megaStone: isMegaStone,
        megaEvolvesPokemon: entry.megaEvolves,
        megaEvolvesInto: entry.megaStone,
      };

      return withHint({ type: "text" as const, text: JSON.stringify(output) });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "不明なエラーが発生しました";
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: message }) },
        ],
        isError: true,
      };
    }
  });
}
