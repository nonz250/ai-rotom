import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations, Pokemon } from "@smogon/calc";
import {
  MAX_STAT_POINT_TOTAL,
  evsSchema,
} from "@ai-rotom/shared";
import {
  pokemonNameResolver,
  natureNameResolver,
} from "../../name-resolvers.js";
import { pokemonById, toDataId, type BaseStats } from "../../data-store.js";
import { TOOL_RESPONSE_HINT_CONTENT } from "../../tool-response-hint.js";

const CHAMPIONS_GEN_NUM = 0;
const DEFAULT_NATURE_EN = "Serious";

const TOOL_NAME = "calculate_stats";
const TOOL_DESCRIPTION =
  "ポケモンの実数値を計算する。種族値・性格・能力ポイントから各ステータスの実数値を算出する。"
  + "育成方針の検討や調整ラインの確認に使用する。"
  + "SP 振りを提案するときは、ブッパ (各ステ 32 振り切り) を勧めるのではなく、本ツールで実数値を試算しつつ目的駆動で刻むこと"
  + "（ポケチャンは 1 SP 単位で振れる / 合計上限は 66 SP / 火力調整・耐久調整・S 調整のいずれも最小限の SP で要求を満たすのが基本）。"
  + "ポケモンチャンピオンズの計算式に対応。";

const statsCalcInputSchema = {
  name: z.string().describe("ポケモン名（日本語 or 英語）"),
  nature: z.string().optional().describe("性格名（省略時: まじめ）"),
  evs: evsSchema
    .optional()
    .describe("能力ポイント(SP)。各ステ 0-32、合計 0-66。省略時は全 0 (無振り)。"),
};

interface StatsOutput {
  name: string;
  nameJa: string;
  nature: string;
  natureJa: string;
  baseStats: BaseStats;
  evs: BaseStats;
  actualStats: BaseStats;
  statPoints: {
    used: number;
    remaining: number;
  };
}

/**
 * ポケモン名を英語に解決する。
 */
function resolvePokemonName(name: string): string {
  const englishName = pokemonNameResolver.toEnglish(name);
  if (englishName !== undefined) {
    return englishName;
  }

  if (pokemonNameResolver.hasEnglishName(name)) {
    return name;
  }

  const suggestions = pokemonNameResolver.suggestSimilar(name);
  const suggestionMessage =
    suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
  throw new Error(`ポケモン「${name}」が見つかりません。${suggestionMessage}`);
}

/**
 * 性格名を英語に解決する。
 */
function resolveNatureName(nature: string | undefined): string {
  if (nature === undefined) {
    return DEFAULT_NATURE_EN;
  }

  const englishName = natureNameResolver.toEnglish(nature);
  if (englishName !== undefined) {
    return englishName;
  }

  if (natureNameResolver.hasEnglishName(nature)) {
    return nature;
  }

  const suggestions = natureNameResolver.suggestSimilar(nature);
  const suggestionMessage =
    suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
  throw new Error(`性格「${nature}」が見つかりません。${suggestionMessage}`);
}

export function registerStatsCalculationTool(server: McpServer): void {
  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    statsCalcInputSchema,
    async (args) => {
      try {
        const gen = Generations.get(CHAMPIONS_GEN_NUM);

        const nameEn = resolvePokemonName(args.name);
        const entry = pokemonById.get(toDataId(nameEn));

        if (entry === undefined) {
          throw new Error(
            `ポケモン「${args.name}」のデータが見つかりません。`,
          );
        }

        const natureEn = resolveNatureName(args.nature);
        const nameJa = entry.nameJa ?? entry.name;
        const natureJa =
          natureNameResolver.toJapanese(natureEn) ?? natureEn;

        const evs = {
          hp: args.evs?.hp ?? 0,
          atk: args.evs?.atk ?? 0,
          def: args.evs?.def ?? 0,
          spa: args.evs?.spa ?? 0,
          spd: args.evs?.spd ?? 0,
          spe: args.evs?.spe ?? 0,
        };

        const pokemon = new Pokemon(gen, entry.name, {
          nature: natureEn,
          evs,
          // @smogon/calc の Specie.types は文字列 union のタプル型。
          // pokemon.json では string[] で保持しているため、overrides の型要件に合わせてキャストする。
          overrides: {
            types: entry.types,
            baseStats: entry.baseStats,
          } as NonNullable<ConstructorParameters<typeof Pokemon>[2]>["overrides"],
        });

        const used =
          evs.hp + evs.atk + evs.def + evs.spa + evs.spd + evs.spe;

        const output: StatsOutput = {
          name: entry.name,
          nameJa,
          nature: natureEn,
          natureJa,
          baseStats: { ...entry.baseStats },
          evs,
          actualStats: {
            hp: pokemon.stats.hp,
            atk: pokemon.stats.atk,
            def: pokemon.stats.def,
            spa: pokemon.stats.spa,
            spd: pokemon.stats.spd,
            spe: pokemon.stats.spe,
          },
          statPoints: {
            used,
            remaining: MAX_STAT_POINT_TOTAL - used,
          },
        };

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(output) },
            TOOL_RESPONSE_HINT_CONTENT,
          ],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "不明なエラーが発生しました";
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
