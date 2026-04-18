import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { naturesById, toDataId } from "../../data-store.js";
import { natureNameResolver } from "../../name-resolvers.js";

const TOOL_NAME = "get_nature_info";
const TOOL_DESCRIPTION =
  "ポケモンの性格の詳細情報（上昇ステ・下降ステ）を取得する。育成方針の検討や性格選びに使用する。plus/minus が null の性格は無補正。ポケモンチャンピオンズ対応。";

const inputSchema = {
  name: z.string().describe("性格名（日本語 or 英語、例: 'ひかえめ'、'Modest'）"),
};

/**
 * get_nature_info ツールの出力形式。
 * plus: 1.1 倍される能力（atk/def/spa/spd/spe）または null（無補正性格）。
 * minus: 0.9 倍される能力または null（無補正性格）。
 */
export interface NatureInfoOutput {
  name: string;
  nameJa: string;
  plus: string | null;
  minus: string | null;
}

/**
 * 性格名を英語に解決する。日本語名・英語名どちらでも受け付ける。
 */
function resolveNatureNameEn(input: string): string {
  const fromJa = natureNameResolver.toEnglish(input);
  if (fromJa !== undefined) {
    return fromJa;
  }
  if (natureNameResolver.hasEnglishName(input)) {
    return input;
  }

  const suggestions = natureNameResolver.suggestSimilar(input);
  const suggestionMessage =
    suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
  throw new Error(`性格「${input}」が見つかりません。${suggestionMessage}`);
}

export function registerNatureInfoTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const englishName = resolveNatureNameEn(args.name);
      const entry = naturesById.get(toDataId(englishName));

      if (entry === undefined) {
        throw new Error(
          `性格「${args.name}」はチャンピオンズでは使用できません。`,
        );
      }

      const output: NatureInfoOutput = {
        name: entry.name,
        nameJa: entry.nameJa,
        plus: entry.plus,
        minus: entry.minus,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
      };
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
