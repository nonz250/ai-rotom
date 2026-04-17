import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { abilitiesById, toDataId } from "../data-store.js";
import { abilityNameResolver } from "../name-resolvers.js";

const TOOL_NAME = "get_ability_info";
const TOOL_DESCRIPTION =
  "ポケモンの特性の詳細情報（効果説明）を取得する。ポケモンチャンピオンズで使える特性のみ返す。対戦でポケモンの特性を理解したいときに使用する。";

const inputSchema = {
  name: z.string().describe("特性名（日本語 or 英語）"),
};

/**
 * get_ability_info ツールの出力形式。
 */
export interface AbilityInfoOutput {
  name: string;
  nameJa: string | null;
  descEn: string;
  shortDescEn: string;
}

/**
 * 特性名を英語に解決する。日本語名・英語名どちらでも受け付ける。
 */
function resolveAbilityNameEn(input: string): string {
  const fromJa = abilityNameResolver.toEnglish(input);
  if (fromJa !== undefined) {
    return fromJa;
  }
  if (abilityNameResolver.hasEnglishName(input)) {
    return input;
  }

  const suggestions = abilityNameResolver.suggestSimilar(input);
  const suggestionMessage =
    suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
  throw new Error(`特性「${input}」が見つかりません。${suggestionMessage}`);
}

export function registerAbilityInfoTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const englishName = resolveAbilityNameEn(args.name);
      const abilityId = toDataId(englishName);
      const entry = abilitiesById.get(abilityId);

      if (entry === undefined) {
        throw new Error(
          `特性「${args.name}」はチャンピオンズでは使用できません。`,
        );
      }

      const nameJa = abilityNameResolver.toJapanese(entry.name) ?? null;

      const output: AbilityInfoOutput = {
        name: entry.name,
        nameJa,
        descEn: entry.desc,
        shortDescEn: entry.shortDesc,
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
