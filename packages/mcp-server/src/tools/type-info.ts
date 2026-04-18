import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations, toID } from "@smogon/calc";
import { championsTypes, typesById } from "../data-store.js";

const CHAMPIONS_GEN_NUM = 0;

const TOOL_NAME = "get_type_info";
const TOOL_DESCRIPTION =
  "ポケモンのタイプの相性情報（攻撃時・防御時の倍率）を取得する。対戦でタイプ相性を確認したいときに使用する。ポケモンチャンピオンズ対応。";

const inputSchema = {
  type: z.string().describe("タイプ名（日本語 or 英語、例: 'ほのお'、'Fire'）"),
};

/**
 * タイプ名と倍率のペア。
 */
export interface TypeEffectivenessEntry {
  multiplier: number;
  nameJa: string;
}

/**
 * get_type_info ツールの出力形式。
 * attackingEffectiveness: 自分が攻撃する時の相性（キーは防御側のタイプ英名）。
 * defendingEffectiveness: 自分が受ける時の相性（キーは攻撃側のタイプ英名）。
 */
export interface TypeInfoOutput {
  name: string;
  nameJa: string;
  attackingEffectiveness: Record<string, TypeEffectivenessEntry>;
  defendingEffectiveness: Record<string, TypeEffectivenessEntry>;
}

/**
 * タイプ名を英語に解決する。日本語名・英語名どちらでも受け付ける。
 * 見つからない場合はエラーをスローする。
 */
function resolveTypeNameEn(input: string): string {
  // 日本語名から引く
  for (const entry of championsTypes) {
    if (entry.nameJa === input) {
      return entry.name;
    }
  }

  // 英語名（大文字小文字無視）で引く
  const normalized = input.toLowerCase();
  const entry = typesById.get(normalized);
  if (entry !== undefined) {
    return entry.name;
  }

  throw new Error(`タイプ「${input}」が見つかりません。`);
}

export function registerTypeInfoTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const englishName = resolveTypeNameEn(args.type);
      const typeEntry = typesById.get(englishName.toLowerCase());

      if (typeEntry === undefined) {
        throw new Error(
          `タイプ「${args.type}」のデータが見つかりません。`,
        );
      }

      const gen = Generations.get(CHAMPIONS_GEN_NUM);
      const attackingType = gen.types.get(toID(englishName));

      if (attackingType === undefined) {
        throw new Error(
          `タイプ「${args.type}」の相性データが見つかりません。`,
        );
      }

      // 自分が攻撃する時の相性
      const attackingEffectiveness: Record<string, TypeEffectivenessEntry> = {};
      const effectivenessMap = attackingType.effectiveness as Record<
        string,
        number
      >;
      for (const defenderType of championsTypes) {
        const multiplier = effectivenessMap[defenderType.name];
        if (multiplier !== undefined) {
          attackingEffectiveness[defenderType.name] = {
            multiplier,
            nameJa: defenderType.nameJa,
          };
        }
      }

      // 自分が受ける時の相性
      const defendingEffectiveness: Record<string, TypeEffectivenessEntry> = {};
      for (const attackerType of championsTypes) {
        const attackerCalcType = gen.types.get(toID(attackerType.name));
        if (attackerCalcType === undefined) {
          continue;
        }
        const multiplier = (
          attackerCalcType.effectiveness as Record<string, number>
        )[englishName];
        if (multiplier !== undefined) {
          defendingEffectiveness[attackerType.name] = {
            multiplier,
            nameJa: attackerType.nameJa,
          };
        }
      }

      const output: TypeInfoOutput = {
        name: typeEntry.name,
        nameJa: typeEntry.nameJa,
        attackingEffectiveness,
        defendingEffectiveness,
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
