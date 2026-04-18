import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ConditionEntry } from "../../data-store.js";
import { championsConditions } from "../../data-store.js";

const TOOL_NAME = "get_condition_info";
const TOOL_DESCRIPTION =
  "バトル条件（天候・フィールド・状態異常・サイド効果）の情報を取得する。category と name で絞り込める。省略時は全カテゴリ・全件を返す。ポケモンチャンピオンズ対応。";

const CATEGORY_VALUES = [
  "weather",
  "terrain",
  "status",
  "sideCondition",
] as const;

type ConditionCategory = (typeof CATEGORY_VALUES)[number];

const inputSchema = {
  category: z
    .enum(CATEGORY_VALUES)
    .optional()
    .describe(
      "絞り込むカテゴリ（weather: 天候 / terrain: フィールド / status: 状態異常 / sideCondition: サイド効果）。省略時は全カテゴリ。",
    ),
  name: z
    .string()
    .optional()
    .describe("絞り込む条件名（日本語 or 英語）。省略時は全件。"),
};

/**
 * get_condition_info ツールの出力形式。
 * category が指定された場合はそのカテゴリ、省略時は全カテゴリを含む。
 * name が指定された場合はそれに合致するエントリのみを含む。
 */
export interface ConditionInfoOutput {
  weather?: ConditionEntry[];
  terrain?: ConditionEntry[];
  status?: ConditionEntry[];
  sideCondition?: ConditionEntry[];
}

/**
 * 指定された name に合致するエントリだけを返す。
 * 日本語名・英語名どちらも受け付ける（大文字小文字は区別しない）。
 */
function filterByName(
  entries: readonly ConditionEntry[],
  name: string,
): ConditionEntry[] {
  const normalized = name.toLowerCase();
  return entries.filter(
    (entry) =>
      entry.name.toLowerCase() === normalized || entry.nameJa === name,
  );
}

/**
 * カテゴリ毎のエントリを name で絞り込んで返す。
 */
function resolveCategoryEntries(
  category: ConditionCategory,
  name: string | undefined,
): ConditionEntry[] {
  const entries = championsConditions[category];
  if (name === undefined) {
    return [...entries];
  }
  return filterByName(entries, name);
}

export function registerConditionInfoTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const output: ConditionInfoOutput = {};

      const targetCategories: readonly ConditionCategory[] =
        args.category !== undefined ? [args.category] : CATEGORY_VALUES;

      for (const category of targetCategories) {
        output[category] = resolveCategoryEntries(category, args.name);
      }

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
