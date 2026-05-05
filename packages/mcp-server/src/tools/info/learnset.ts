import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { championsLearnsets, movesById, toDataId } from "../../data-store.js";
import { pokemonNameResolver } from "../../name-resolvers.js";
import { withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "get_learnset";
const TOOL_DESCRIPTION =
  "ポケモンチャンピオンズで特定のポケモンが覚える技の一覧を取得する。"
  + "「○○は何を覚える？」のようにポケモン名と覚える技が話題に出たら、知識ベースで即答せず、まずこのツールを呼んでデータを引くこと"
  + "（チャンピオンズ固有の技プール変更=没収技等が反映される）。"
  + "パーティ構築や技構成の検討に使用する。";

const inputSchema = {
  name: z.string().describe("ポケモン名（日本語 or 英語）"),
};

/**
 * get_learnset ツールの出力形式。
 * moves は英語名と日本語名のペアで返す（日本語名が無い場合は ja に null）。
 */
export interface LearnsetOutput {
  pokemon: string;
  pokemonJa: string | null;
  moves: LearnsetMoveEntry[];
}

export interface LearnsetMoveEntry {
  en: string;
  ja: string | null;
}

/**
 * ポケモン名を英語に解決する。日本語名・英語名どちらでも受け付ける。
 */
function resolvePokemonNameEn(input: string): string {
  const fromJa = pokemonNameResolver.toEnglish(input);
  if (fromJa !== undefined) {
    return fromJa;
  }
  if (pokemonNameResolver.hasEnglishName(input)) {
    return input;
  }

  const suggestions = pokemonNameResolver.suggestSimilar(input);
  const suggestionMessage =
    suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
  throw new Error(`ポケモン「${input}」が見つかりません。${suggestionMessage}`);
}

/**
 * 技 ID から出力用の英語名・日本語名ペアを組み立てる。
 * チャンピオンズデータに存在しない ID はフォールバックで ID をそのまま英語名に使い、ja は null とする。
 */
function buildLearnsetMoveEntry(moveId: string): LearnsetMoveEntry {
  const moveEntry = movesById.get(moveId);
  if (moveEntry === undefined) {
    return { en: moveId, ja: null };
  }
  return { en: moveEntry.name, ja: moveEntry.nameJa };
}

export function registerLearnsetTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const englishName = resolvePokemonNameEn(args.name);
      const pokemonId = toDataId(englishName);
      const moveIds = championsLearnsets[pokemonId];

      if (moveIds === undefined) {
        throw new Error(
          `ポケモン「${args.name}」のチャンピオンズ向け learnset データが見つかりません。`,
        );
      }

      const pokemonJa = pokemonNameResolver.toJapanese(englishName) ?? null;
      const moves = moveIds.map(buildLearnsetMoveEntry);

      const output: LearnsetOutput = {
        pokemon: englishName,
        pokemonJa,
        moves,
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
