import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import { calculateTypeEffectiveness } from "@ai-rotom/shared";
import {
  championsLearnsets,
  championsPokemon,
  championsTypes,
  movesById,
  type MoveCategory,
  type PokemonEntry,
} from "../../data-store.js";
import { withHint } from "../../tool-response-hint.js";

const CHAMPIONS_GEN_NUM = 0;

/** 半減以下（=0.5 倍以下）判定のしきい値 */
const RESIST_THRESHOLD = 0.5;

/** 抜群（=2 倍以上）判定のしきい値 */
const WEAKNESS_THRESHOLD = 2;

/** 無効（=0 倍）判定値 */
const IMMUNITY_MULTIPLIER = 0;

/** ステータス技を示す category 値 */
const STATUS_CATEGORY: MoveCategory = "Status";

const TOOL_NAME = "search_pokemon_by_type_effectiveness";
const TOOL_DESCRIPTION =
  "タイプ相性条件でポケモンを逆引き検索する。"
  + "指定タイプを半減/無効/弱点で受けるポケモンや、指定タイプの攻撃技を覚えるポケモンを絞り込める。"
  + "複数条件の AND 指定が可能。対策ポケモン探しやパーティ構築に使用する。ポケモンチャンピオンズ対応。";

const inputSchema = {
  resistsType: z
    .string()
    .optional()
    .describe("指定タイプの攻撃を 0.5 倍以下で受けるポケモン（半減・無効含む）"),
  immuneToType: z
    .string()
    .optional()
    .describe("指定タイプの攻撃を無効化するポケモン（0 倍）"),
  weakToType: z
    .string()
    .optional()
    .describe("指定タイプの攻撃で 2 倍以上のダメージを受けるポケモン（4 倍含む）"),
  hasAttackingType: z
    .string()
    .optional()
    .describe("指定タイプの攻撃技を 1 つ以上覚えるポケモン"),
};

export interface TypeEffectivenessSearchResultPokemon {
  id: string;
  name: string;
  nameJa: string | null;
  types: string[];
  baseStats: PokemonEntry["baseStats"];
  abilities: string[];
  /**
   * resistsType / immuneToType / weakToType いずれかが指定されたときに、
   * そのタイプに対する実際の防御倍率を返す。
   * 条件を複数指定した場合は、resistsType > immuneToType > weakToType の優先順で設定される。
   */
  matchedEffectiveness?: number;
}

interface NormalizedConditions {
  resistsType: string | null;
  immuneToType: string | null;
  weakToType: string | null;
  hasAttackingType: string | null;
}

export interface SearchByTypeEffectivenessOutput {
  conditions: NormalizedConditions;
  pokemon: TypeEffectivenessSearchResultPokemon[];
}

/**
 * タイプ名（日本語 or 英語）を英語名に解決する。
 * 見つからない場合はエラーをスローする。
 */
function resolveTypeNameEn(input: string): string {
  // 日本語名 (例: "ほのお") で引く
  for (const entry of championsTypes) {
    if (entry.nameJa === input) {
      return entry.name;
    }
  }

  // 英語名 (大文字小文字無視)
  const normalized = input.toLowerCase();
  for (const entry of championsTypes) {
    if (entry.id === normalized) {
      return entry.name;
    }
  }

  throw new Error(`タイプ「${input}」が見つかりません。`);
}

/**
 * 攻撃タイプ名 → 防御側タイプ配列への複合倍率を算出する。
 * 2 タイプ複合は効果倍率を掛け合わせる（@smogon/calc 標準挙動）。
 */
function calcDefensiveMultiplier(
  attackTypeName: string,
  defenderTypes: readonly string[],
  gen: ReturnType<typeof Generations.get>,
): number {
  return calculateTypeEffectiveness(
    gen,
    attackTypeName as TypeName,
    defenderTypes as readonly TypeName[],
  );
}

/**
 * 指定ポケモンが、指定タイプの攻撃技を learnsets 内に持つかを判定する。
 * Status 技は除外する。
 */
function hasAttackingMoveOfType(
  pokemonId: string,
  attackTypeEn: string,
): boolean {
  const learnset = championsLearnsets[pokemonId];
  if (learnset === undefined) {
    return false;
  }
  for (const moveId of learnset) {
    const move = movesById.get(moveId);
    if (move === undefined) continue;
    if (move.category === STATUS_CATEGORY) continue;
    if (move.type === attackTypeEn) {
      return true;
    }
  }
  return false;
}

export function registerSearchByTypeEffectivenessTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      // 少なくとも 1 つの条件必須
      const hasAnyCondition =
        args.resistsType !== undefined
        || args.immuneToType !== undefined
        || args.weakToType !== undefined
        || args.hasAttackingType !== undefined;
      if (!hasAnyCondition) {
        throw new Error(
          "少なくとも 1 つの条件 (resistsType / immuneToType / weakToType / hasAttackingType) を指定してください。",
        );
      }

      const gen = Generations.get(CHAMPIONS_GEN_NUM);

      const resistsTypeEn
        = args.resistsType !== undefined
          ? resolveTypeNameEn(args.resistsType)
          : null;
      const immuneToTypeEn
        = args.immuneToType !== undefined
          ? resolveTypeNameEn(args.immuneToType)
          : null;
      const weakToTypeEn
        = args.weakToType !== undefined
          ? resolveTypeNameEn(args.weakToType)
          : null;
      const hasAttackingTypeEn
        = args.hasAttackingType !== undefined
          ? resolveTypeNameEn(args.hasAttackingType)
          : null;

      const matched: TypeEffectivenessSearchResultPokemon[] = [];

      for (const entry of championsPokemon) {
        let matchedEffectiveness: number | undefined;

        // resistsType: 0.5 倍以下で受ける
        if (resistsTypeEn !== null) {
          const m = calcDefensiveMultiplier(resistsTypeEn, entry.types, gen);
          if (m > RESIST_THRESHOLD) continue;
          matchedEffectiveness = m;
        }

        // immuneToType: 完全無効
        if (immuneToTypeEn !== null) {
          const m = calcDefensiveMultiplier(immuneToTypeEn, entry.types, gen);
          if (m !== IMMUNITY_MULTIPLIER) continue;
          if (matchedEffectiveness === undefined) {
            matchedEffectiveness = m;
          }
        }

        // weakToType: 2 倍以上で受ける
        if (weakToTypeEn !== null) {
          const m = calcDefensiveMultiplier(weakToTypeEn, entry.types, gen);
          if (m < WEAKNESS_THRESHOLD) continue;
          if (matchedEffectiveness === undefined) {
            matchedEffectiveness = m;
          }
        }

        // hasAttackingType: 指定タイプの攻撃技を 1 つ以上覚える
        if (hasAttackingTypeEn !== null) {
          if (!hasAttackingMoveOfType(entry.id, hasAttackingTypeEn)) continue;
        }

        matched.push({
          id: entry.id,
          name: entry.name,
          nameJa: entry.nameJa,
          types: [...entry.types],
          baseStats: { ...entry.baseStats },
          abilities: [...entry.abilities],
          ...(matchedEffectiveness !== undefined
            ? { matchedEffectiveness }
            : {}),
        });
      }

      // name 昇順ソート
      matched.sort((a, b) => a.name.localeCompare(b.name));

      const output: SearchByTypeEffectivenessOutput = {
        conditions: {
          resistsType: resistsTypeEn,
          immuneToType: immuneToTypeEn,
          weakToType: weakToTypeEn,
          hasAttackingType: hasAttackingTypeEn,
        },
        pokemon: matched,
      };

      return withHint({ type: "text" as const, text: JSON.stringify(output) });
    } catch (error: unknown) {
      const message
        = error instanceof Error ? error.message : "不明なエラーが発生しました";
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ error: message }) },
        ],
        isError: true,
      };
    }
  });
}
