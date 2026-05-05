import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations } from "@smogon/calc";
import {
  classifyPokemonTypeMatchups,
  calculateTypeEffectiveness,
  pokemonSchema,
  WEAKNESS_THRESHOLD,
} from "@ai-rotom/shared";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import type { TypeMultiplier } from "@ai-rotom/shared";
import {
  abilityNameResolver,
  pokemonNameResolver,
} from "../../name-resolvers.js";
import { pokemonById, toDataId } from "../../data-store.js";
import { TOOL_RESPONSE_HINT_CONTENT } from "../../tool-response-hint.js";

const CHAMPIONS_GEN_NUM = 0;

const TOOL_NAME = "analyze_party_weakness";
const TOOL_DESCRIPTION =
  "パーティ各メンバーのタイプ相性データを集計する。どのタイプが何匹の弱点か（teamWeaknesses）、どのタイプに抜群を取れないか（uncoveredTypes）を返す。致命性の判断は AI が文脈で行う前提。ポケモンチャンピオンズ対応。";

const partyAnalysisInputSchema = {
  party: z.array(pokemonSchema).describe("パーティメンバー"),
};

/** ???タイプは計算対象から除外するためのマーカー */
const UNKNOWN_TYPE_NAME = "???";

interface MemberAnalysis {
  name: string;
  nameJa: string;
  types: string[];
  weaknesses: TypeMultiplier[];
  resistances: TypeMultiplier[];
  immunities: string[];
}

interface TeamWeaknessEntry {
  count: number;
  members: string[];
}

interface PartyAnalysisOutput {
  members: MemberAnalysis[];
  teamWeaknesses: Record<string, TeamWeaknessEntry>;
  uncoveredTypes: string[];
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
 * 日本語・英語のどちらの名前でも英語名に解決する。
 * 未知の名前は undefined を返し、呼び出し側で silent ignore する。
 */
function resolveOptionalName(
  resolver: typeof abilityNameResolver,
  name: string | undefined,
): string | undefined {
  if (name === undefined) return undefined;
  const english = resolver.toEnglish(name);
  if (english !== undefined) return english;
  if (resolver.hasEnglishName(name)) return name;
  return undefined;
}

/**
 * パーティ全体の攻撃範囲でカバーされていないタイプを判定する。
 * あるタイプに対して、パーティのどのメンバーのタイプからも等倍以上の攻撃が出せない場合、
 * そのタイプは uncovered とみなす。
 */
function findUncoveredTypes(
  memberTypes: string[][],
  gen: ReturnType<typeof Generations.get>,
): string[] {
  const uncovered: string[] = [];

  for (const targetType of gen.types) {
    if (targetType.name === UNKNOWN_TYPE_NAME) {
      continue;
    }

    let isCovered = false;
    for (const types of memberTypes) {
      for (const memberType of types) {
        const effectiveness = calculateTypeEffectiveness(
          gen,
          memberType as TypeName,
          [targetType.name],
        );
        if (effectiveness >= WEAKNESS_THRESHOLD) {
          isCovered = true;
          break;
        }
      }
      if (isCovered) break;
    }

    if (!isCovered) {
      uncovered.push(targetType.name);
    }
  }

  return uncovered;
}

export function registerPartyAnalysisTool(server: McpServer): void {
  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    partyAnalysisInputSchema,
    async (args) => {
      try {
        const gen = Generations.get(CHAMPIONS_GEN_NUM);
        const members: MemberAnalysis[] = [];
        const teamWeaknesses: Record<string, TeamWeaknessEntry> = {};
        const memberTypesList: string[][] = [];

        for (const member of args.party) {
          const nameEn = resolvePokemonName(member.name);
          const entry = pokemonById.get(toDataId(nameEn));

          if (entry === undefined) {
            throw new Error(
              `ポケモン「${member.name}」のデータが見つかりません。`,
            );
          }

          const nameJa = entry.nameJa ?? entry.name;
          const types = [...entry.types];
          memberTypesList.push(types);

          const resolvedAbility = resolveOptionalName(
            abilityNameResolver,
            member.ability,
          );

          const { weaknesses, resistances, immunities } =
            classifyPokemonTypeMatchups(types, gen, {
              ability: resolvedAbility,
            });

          members.push({
            name: entry.name,
            nameJa,
            types,
            weaknesses,
            resistances,
            immunities,
          });

          // パーティ全体の弱点を集計
          for (const weakness of weaknesses) {
            if (teamWeaknesses[weakness.type] === undefined) {
              teamWeaknesses[weakness.type] = { count: 0, members: [] };
            }
            teamWeaknesses[weakness.type].count += 1;
            teamWeaknesses[weakness.type].members.push(entry.name);
          }
        }

        // 攻撃範囲の穴を分析
        const uncoveredTypes = findUncoveredTypes(memberTypesList, gen);

        const output: PartyAnalysisOutput = {
          members,
          teamWeaknesses,
          uncoveredTypes,
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
