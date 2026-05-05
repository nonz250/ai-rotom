import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MoveCategory } from "../../data-store.js";
import { movesById, toDataId } from "../../data-store.js";
import { moveNameResolver } from "../../name-resolvers.js";
import { withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "get_move_info";
const TOOL_DESCRIPTION =
  "ポケモンの技の詳細情報（タイプ・威力・命中率・分類・優先度・効果説明）を取得する。対戦で使う技の仕様を確認したいときに使用する。ポケモンチャンピオンズ対応。";

const inputSchema = {
  name: z.string().describe("技名（日本語 or 英語）"),
};

/**
 * get_move_info ツールの出力形式。
 * basePower は変化技の場合 null を返す（0 は true の威力 0 と混同されるため）。
 * accuracy は必中技の場合 true、通常は数値。
 */
export interface MoveInfoOutput {
  name: string;
  nameJa: string | null;
  type: string;
  category: MoveCategory;
  basePower: number | null;
  accuracy: number | true;
  pp: number;
  priority: number;
  target: string;
  flags: string[];
  descJa: string | null;
  descEn: string;
  shortDescEn: string;
}

/**
 * 技名を英語に解決する。日本語名・英語名どちらでも受け付ける。
 * 名前変換辞書には登録されているがチャンピオンズで使えない技の場合はエラー。
 */
function resolveMoveNameEn(input: string): string {
  const fromJa = moveNameResolver.toEnglish(input);
  if (fromJa !== undefined) {
    return fromJa;
  }
  if (moveNameResolver.hasEnglishName(input)) {
    return input;
  }

  const suggestions = moveNameResolver.suggestSimilar(input);
  const suggestionMessage =
    suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
  throw new Error(`技「${input}」が見つかりません。${suggestionMessage}`);
}

/**
 * 変化技（Status）の威力は 0 だが、ユーザー側では null の方が意図が明確なので変換する。
 */
function normalizeBasePower(category: MoveCategory, basePower: number): number | null {
  if (category === "Status") {
    return null;
  }
  return basePower;
}

export function registerMoveInfoTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const englishName = resolveMoveNameEn(args.name);
      const moveId = toDataId(englishName);
      const entry = movesById.get(moveId);

      if (entry === undefined) {
        throw new Error(
          `技「${args.name}」はチャンピオンズでは使用できません。`,
        );
      }

      const output: MoveInfoOutput = {
        name: entry.name,
        nameJa: entry.nameJa,
        type: entry.type,
        category: entry.category,
        basePower: normalizeBasePower(entry.category, entry.basePower),
        accuracy: entry.accuracy,
        pp: entry.pp,
        priority: entry.priority,
        target: entry.target,
        flags: [...entry.flags],
        descJa: null,
        descEn: entry.desc,
        shortDescEn: entry.shortDesc,
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
