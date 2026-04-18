import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MoveCategory } from "../../data-store.js";
import {
  championsLearnsets,
  movesById,
  pokemonById,
  toDataId,
} from "../../data-store.js";
import { moveNameResolver } from "../../name-resolvers.js";

const TOOL_NAME = "search_pokemon_by_move";
const TOOL_DESCRIPTION =
  "特定の技を覚えるポケモンを逆引き検索する。ステルスロックなど特定の技を覚えさせたい場合の候補ポケモン探しに使用する。ポケモンチャンピオンズ対応。";

const inputSchema = {
  moveName: z.string().describe("技名（日本語 or 英語）"),
};

export interface MoveSearchResultMove {
  id: string;
  name: string;
  nameJa: string | null;
  type: string;
  category: MoveCategory;
}

export interface MoveSearchResultPokemon {
  id: string;
  name: string;
  nameJa: string | null;
  types: string[];
  abilities: string[];
}

export interface SearchPokemonByMoveOutput {
  move: MoveSearchResultMove;
  pokemon: MoveSearchResultPokemon[];
}

/**
 * 技名を英語に解決する。日本語名・英語名どちらも受け付ける。
 * 名前辞書に存在してもチャンピオンズで使用できない技は movesById が undefined を返すのでエラー。
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

export function registerSearchByMoveTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const englishName = resolveMoveNameEn(args.moveName);
      const moveId = toDataId(englishName);
      const moveEntry = movesById.get(moveId);

      if (moveEntry === undefined) {
        throw new Error(
          `技「${args.moveName}」はチャンピオンズでは使用できません。`,
        );
      }

      const matchedPokemon: MoveSearchResultPokemon[] = [];
      for (const [pokemonId, moveIds] of Object.entries(championsLearnsets)) {
        if (!moveIds.includes(moveId)) {
          continue;
        }
        const entry = pokemonById.get(pokemonId);
        if (entry === undefined) {
          // learnset には存在するが pokemon.json に無い（データ欠落）はスキップ
          continue;
        }
        matchedPokemon.push({
          id: entry.id,
          name: entry.name,
          nameJa: entry.nameJa,
          types: [...entry.types],
          abilities: [...entry.abilities],
        });
      }

      // name 昇順ソート
      matchedPokemon.sort((a, b) => a.name.localeCompare(b.name));

      const output: SearchPokemonByMoveOutput = {
        move: {
          id: moveEntry.id,
          name: moveEntry.name,
          nameJa: moveEntry.nameJa,
          type: moveEntry.type,
          category: moveEntry.category,
        },
        pokemon: matchedPokemon,
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
