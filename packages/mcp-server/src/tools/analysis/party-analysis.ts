import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import { calculateTypeEffectiveness } from "@ai-rotom/shared";
import {
  pokemonNameResolver,
} from "../../name-resolvers.js";
import { pokemonById, toDataId } from "../../data-store.js";
import { pokemonSchema } from "../schemas/pokemon-input.js";

const CHAMPIONS_GEN_NUM = 0;

const TOOL_NAME = "analyze_party_weakness";
const TOOL_DESCRIPTION =
  "パーティのタイプ相性を分析し、弱点と攻撃範囲の穴を洗い出す。パーティ構築の改善やバランスの確認に使用する。ポケモンチャンピオンズ対応。";

const partyAnalysisInputSchema = {
  party: z.array(pokemonSchema).describe("パーティメンバー"),
};

/** タイプ相性の倍率しきい値 */
const WEAKNESS_THRESHOLD = 2;
const RESISTANCE_THRESHOLD = 1;
const IMMUNITY_THRESHOLD = 0;

/** 致命的弱点とみなすための最低弱点数 */
const CRITICAL_WEAKNESS_MIN_COUNT = 2;

/**
 * タイプ名の英語→日本語マッピング。
 */
const TYPE_NAME_EN_TO_JA: ReadonlyMap<string, string> = new Map([
  ["Normal", "ノーマル"],
  ["Grass", "くさ"],
  ["Fire", "ほのお"],
  ["Water", "みず"],
  ["Electric", "でんき"],
  ["Ice", "こおり"],
  ["Flying", "ひこう"],
  ["Bug", "むし"],
  ["Poison", "どく"],
  ["Ground", "じめん"],
  ["Rock", "いわ"],
  ["Fighting", "かくとう"],
  ["Psychic", "エスパー"],
  ["Ghost", "ゴースト"],
  ["Dragon", "ドラゴン"],
  ["Dark", "あく"],
  ["Steel", "はがね"],
  ["Fairy", "フェアリー"],
]);

interface TypeMultiplier {
  type: string;
  multiplier: number;
}

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

interface CriticalWeakness {
  type: string;
  weakCount: number;
  resistCount: number;
}

interface PartyAnalysisOutput {
  members: MemberAnalysis[];
  teamWeaknesses: Record<string, TeamWeaknessEntry>;
  uncoveredTypes: string[];
  criticalWeaknesses: CriticalWeakness[];
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

/** ???タイプは計算対象から除外するためのマーカー */
const UNKNOWN_TYPE_NAME = "???";

/**
 * ポケモンのタイプに対する各攻撃タイプの倍率を計算する。
 */
function calculateTypeMatchups(
  pokemonTypes: string[],
  gen: ReturnType<typeof Generations.get>,
): {
  weaknesses: TypeMultiplier[];
  resistances: TypeMultiplier[];
  immunities: string[];
} {
  const weaknesses: TypeMultiplier[] = [];
  const resistances: TypeMultiplier[] = [];
  const immunities: string[] = [];

  const defenderTypes = pokemonTypes as readonly TypeName[];

  for (const attackType of gen.types) {
    if (attackType.name === UNKNOWN_TYPE_NAME) {
      continue;
    }

    const multiplier = calculateTypeEffectiveness(
      gen,
      attackType.name,
      defenderTypes,
    );

    if (multiplier === IMMUNITY_THRESHOLD) {
      immunities.push(attackType.name);
    } else if (multiplier >= WEAKNESS_THRESHOLD) {
      weaknesses.push({ type: attackType.name, multiplier });
    } else if (multiplier < RESISTANCE_THRESHOLD) {
      resistances.push({ type: attackType.name, multiplier });
    }
  }

  return { weaknesses, resistances, immunities };
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
        const teamResistances: Record<string, number> = {};
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

          const { weaknesses, resistances, immunities } =
            calculateTypeMatchups(types, gen);

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

          // パーティ全体の耐性を集計
          for (const resistance of resistances) {
            teamResistances[resistance.type] =
              (teamResistances[resistance.type] ?? 0) + 1;
          }
          for (const immuneType of immunities) {
            teamResistances[immuneType] =
              (teamResistances[immuneType] ?? 0) + 1;
          }
        }

        // 致命的弱点: 弱点を突かれるメンバーが多く、耐性を持つメンバーが少ないタイプ
        const criticalWeaknesses: CriticalWeakness[] = [];
        for (const [type, entry] of Object.entries(teamWeaknesses)) {
          const resistCount = teamResistances[type] ?? 0;
          if (entry.count >= CRITICAL_WEAKNESS_MIN_COUNT) {
            criticalWeaknesses.push({
              type,
              weakCount: entry.count,
              resistCount,
            });
          }
        }

        // 弱点数の多い順にソート
        criticalWeaknesses.sort((a, b) => b.weakCount - a.weakCount);

        // 攻撃範囲の穴を分析
        const uncoveredTypes = findUncoveredTypes(memberTypesList, gen);

        const output: PartyAnalysisOutput = {
          members,
          teamWeaknesses,
          uncoveredTypes,
          criticalWeaknesses,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
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
