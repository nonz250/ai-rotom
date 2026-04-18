import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  abilitiesById,
  championsPokemon,
  toDataId,
} from "../../data-store.js";
import { abilityNameResolver } from "../../name-resolvers.js";

const TOOL_NAME = "search_pokemon_by_ability";
const TOOL_DESCRIPTION =
  "特定の特性を持つポケモンを逆引き検索する。いかく・もうか等の特性を持つポケモンを絞り込みたい場合に使用する。ポケモンチャンピオンズ対応。";

const inputSchema = {
  abilityName: z.string().describe("特性名（日本語 or 英語）"),
};

export interface AbilitySearchResultAbility {
  id: string;
  name: string;
  nameJa: string | null;
  shortDesc: string;
}

export interface AbilitySearchResultPokemon {
  id: string;
  name: string;
  nameJa: string | null;
  types: string[];
  abilities: string[];
}

export interface SearchPokemonByAbilityOutput {
  ability: AbilitySearchResultAbility;
  pokemon: AbilitySearchResultPokemon[];
}

/**
 * 特性名を英語に解決する。日本語名・英語名どちらも受け付ける。
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

export function registerSearchByAbilityTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const englishName = resolveAbilityNameEn(args.abilityName);
      const abilityId = toDataId(englishName);
      const abilityEntry = abilitiesById.get(abilityId);

      if (abilityEntry === undefined) {
        throw new Error(
          `特性「${args.abilityName}」はチャンピオンズでは使用できません。`,
        );
      }

      const matchedPokemon: AbilitySearchResultPokemon[] = [];
      for (const entry of championsPokemon) {
        if (!entry.abilities.includes(abilityEntry.name)) {
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

      const output: SearchPokemonByAbilityOutput = {
        ability: {
          id: abilityEntry.id,
          name: abilityEntry.name,
          nameJa: abilityEntry.nameJa,
          shortDesc: abilityEntry.shortDesc,
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
