import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations, toID } from "@smogon/calc";
import {
  pokemonNameResolver,
  abilityNameResolver,
} from "../name-resolvers.js";
import { championsLearnsets, toDataId } from "../data-store.js";

const CHAMPIONS_GEN_NUM = 0;
const DEFAULT_SEARCH_LIMIT = 20;

const GET_POKEMON_INFO_TOOL_NAME = "get_pokemon_info";
const GET_POKEMON_INFO_DESCRIPTION =
  "ポケモンの詳細情報（種族値・タイプ・特性・体重）を取得する。ポケモンの強さや役割を把握するために使用する。ポケモン対戦、パーティ構築、ダメージ計算の前提情報として活用できる。";

const SEARCH_POKEMON_TOOL_NAME = "search_pokemon";
const SEARCH_POKEMON_DESCRIPTION =
  "ポケモンチャンピオンズに登場するポケモンを検索する。タイプや種族値の条件で絞り込める。パーティ構築で特定の条件を満たすポケモンを探すときに使用する。";

/**
 * タイプ名の日本語→英語マッピング。
 * @smogon/calc の gen 0 に登場するタイプのみ。
 */
const TYPE_NAME_JA_TO_EN: ReadonlyMap<string, string> = new Map([
  ["ノーマル", "Normal"],
  ["くさ", "Grass"],
  ["ほのお", "Fire"],
  ["みず", "Water"],
  ["でんき", "Electric"],
  ["こおり", "Ice"],
  ["ひこう", "Flying"],
  ["むし", "Bug"],
  ["どく", "Poison"],
  ["じめん", "Ground"],
  ["いわ", "Rock"],
  ["かくとう", "Fighting"],
  ["エスパー", "Psychic"],
  ["ゴースト", "Ghost"],
  ["ドラゴン", "Dragon"],
  ["あく", "Dark"],
  ["はがね", "Steel"],
  ["フェアリー", "Fairy"],
]);

const TYPE_NAME_EN_TO_JA: ReadonlyMap<string, string> = new Map(
  [...TYPE_NAME_JA_TO_EN.entries()].map(([ja, en]) => [en, ja]),
);

/** 英語タイプ名のセット（大文字小文字を無視した検索用） */
const VALID_TYPE_NAMES_EN: ReadonlySet<string> = new Set(
  [...TYPE_NAME_JA_TO_EN.values()].map((name) => name.toLowerCase()),
);

/**
 * タイプ名を英語に正規化する。日本語名・英語名どちらでも受け付ける。
 */
function resolveTypeName(input: string): string | undefined {
  // 日本語名の場合
  const fromJa = TYPE_NAME_JA_TO_EN.get(input);
  if (fromJa !== undefined) {
    return fromJa;
  }

  // 英語名の場合（大文字小文字を無視）
  if (VALID_TYPE_NAMES_EN.has(input.toLowerCase())) {
    // 正しい大文字小文字のタイプ名を返す
    for (const [, en] of TYPE_NAME_JA_TO_EN) {
      if (en.toLowerCase() === input.toLowerCase()) {
        return en;
      }
    }
  }

  return undefined;
}

/**
 * ポケモン名を英語に解決する。日本語名・英語名どちらでも受け付ける。
 * 見つからない場合はエラーをスローする。
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
 * 種族値の合計を計算する。
 */
function calculateBst(baseStats: {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}): number {
  return (
    baseStats.hp +
    baseStats.atk +
    baseStats.def +
    baseStats.spa +
    baseStats.spd +
    baseStats.spe
  );
}

/**
 * species オブジェクトの abilities フィールドから特性名の配列を取得する。
 */
function extractAbilities(abilities: Record<string, string>): string[] {
  return Object.values(abilities);
}

/**
 * 特性名の英語→日本語変換を行う。変換できない場合は英語名をそのまま返す。
 */
function resolveAbilityNameJa(abilityEn: string): string {
  return abilityNameResolver.toJapanese(abilityEn) ?? abilityEn;
}

interface PokemonInfoResult {
  name: string;
  nameJa: string;
  types: string[];
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
  };
  bst: number;
  abilities: string[];
  abilitiesJa: string[];
  weightkg: number;
  otherFormes?: string[];
  /**
   * ポケモンチャンピオンズで覚えられる技の総数。
   * learnset データが存在しないポケモンの場合は null。
   * 注: @smogon/calc の species データは通常特性しか持たないため、
   * 隠れ特性を含む全特性の列挙はできない（データ制約）。
   */
  learnableMoveCount: number | null;
}

interface SearchPokemonResult {
  name: string;
  nameJa: string;
  types: string[];
  bst: number;
}

export function registerPokemonInfoTools(server: McpServer): void {
  const gen = Generations.get(CHAMPIONS_GEN_NUM);

  // ツール1: get_pokemon_info
  server.tool(
    GET_POKEMON_INFO_TOOL_NAME,
    GET_POKEMON_INFO_DESCRIPTION,
    {
      name: z
        .string()
        .describe("ポケモン名（日本語 or 英語）"),
    },
    async (args) => {
      try {
        const englishName = resolvePokemonName(args.name);
        const species = gen.species.get(toID(englishName));

        if (!species) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `ポケモン「${args.name}」のデータが見つかりません。`,
                }),
              },
            ],
            isError: true,
          };
        }

        const abilities = extractAbilities(
          species.abilities as Record<string, string>,
        );
        const abilitiesJa = abilities.map(resolveAbilityNameJa);
        const nameJa =
          pokemonNameResolver.toJapanese(species.name) ?? species.name;

        const learnsetEntry = championsLearnsets[toDataId(species.name)];
        const learnableMoveCount =
          learnsetEntry !== undefined ? learnsetEntry.length : null;

        const result: PokemonInfoResult = {
          name: species.name,
          nameJa,
          types: [...species.types],
          baseStats: { ...species.baseStats },
          bst: calculateBst(species.baseStats),
          abilities,
          abilitiesJa,
          weightkg: species.weightkg,
          learnableMoveCount,
        };

        if (species.otherFormes && species.otherFormes.length > 0) {
          result.otherFormes = [...species.otherFormes];
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result) },
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

  // ツール2: search_pokemon
  server.tool(
    SEARCH_POKEMON_TOOL_NAME,
    SEARCH_POKEMON_DESCRIPTION,
    {
      type: z
        .string()
        .optional()
        .describe("タイプで絞り込み（例: 'ほのお'、'Fire'）"),
      minStat: z
        .object({
          hp: z.number().optional(),
          atk: z.number().optional(),
          def: z.number().optional(),
          spa: z.number().optional(),
          spd: z.number().optional(),
          spe: z.number().optional(),
        })
        .optional()
        .describe("種族値の下限で絞り込み"),
      limit: z
        .number()
        .optional()
        .describe(`返す件数（デフォルト: ${DEFAULT_SEARCH_LIMIT}）`),
    },
    async (args) => {
      try {
        const limit = args.limit ?? DEFAULT_SEARCH_LIMIT;

        // タイプ名を英語に解決
        let typeFilterEn: string | undefined;
        if (args.type !== undefined) {
          typeFilterEn = resolveTypeName(args.type);
          if (typeFilterEn === undefined) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `タイプ「${args.type}」が見つかりません。`,
                  }),
                },
              ],
              isError: true,
            };
          }
        }

        const results: SearchPokemonResult[] = [];

        for (const species of gen.species) {
          // タイプフィルター
          if (
            typeFilterEn !== undefined &&
            !species.types.includes(typeFilterEn)
          ) {
            continue;
          }

          // 種族値下限フィルター
          if (args.minStat !== undefined) {
            const stats = species.baseStats;
            if (
              (args.minStat.hp !== undefined && stats.hp < args.minStat.hp) ||
              (args.minStat.atk !== undefined &&
                stats.atk < args.minStat.atk) ||
              (args.minStat.def !== undefined &&
                stats.def < args.minStat.def) ||
              (args.minStat.spa !== undefined &&
                stats.spa < args.minStat.spa) ||
              (args.minStat.spd !== undefined &&
                stats.spd < args.minStat.spd) ||
              (args.minStat.spe !== undefined &&
                stats.spe < args.minStat.spe)
            ) {
              continue;
            }
          }

          const nameJa =
            pokemonNameResolver.toJapanese(species.name) ?? species.name;

          results.push({
            name: species.name,
            nameJa,
            types: [...species.types],
            bst: calculateBst(species.baseStats),
          });

          if (results.length >= limit) {
            break;
          }
        }

        return {
          content: [
            { type: "text" as const, text: JSON.stringify(results) },
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
