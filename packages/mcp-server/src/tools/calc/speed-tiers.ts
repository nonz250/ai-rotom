import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Generations, Pokemon } from "@smogon/calc";
import { MAX_STAT_POINT_PER_STAT } from "@ai-rotom/shared";
import {
  championsPokemon,
  pokemonById,
  toDataId,
  type PokemonEntry,
} from "../../data-store.js";
import { pokemonNameResolver } from "../../name-resolvers.js";
import { TOOL_RESPONSE_HINT_CONTENT } from "../../tool-response-hint.js";

const CHAMPIONS_GEN_NUM = 0;

/** デフォルト素早さ計算に使う無補正性格の英名 */
const NEUTRAL_NATURE_EN = "Serious";

/** 最速性格の英名（Spe +） */
const JOLLY_NATURE_EN = "Jolly";

/** around 指定時に参照する実数値の許容幅（±N） */
const AROUND_WINDOW = 10;

const TOOL_NAME = "list_speed_tiers";
const TOOL_DESCRIPTION =
  "素早さの実数値ライン一覧を取得する。"
  + "各エントリには finalSpeed（無振り無補正）・withNeutralMax（準速＝無補正性格で素早さに 32 SP 振り切り）・withJollyMax（最速＝補正性格で素早さに 32 SP 振り切り）の 3 列をデフォルトで含めて返す。"
  + "S ライン比較や対面の先後判定では準速・最速の双方を必ずユーザーに提示すること（最速だけ示すと準速個体を取りこぼす）。"
  + "around で指定ポケモン付近、range で実数値範囲を指定できる。省略時は全ポケモンを返す。"
  + "ポケモンチャンピオンズ仕様（Lv50・IV31・SP 0〜32）で計算。";

const rangeSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .optional()
  .describe("実数値 (finalSpeed) の範囲フィルタ");

const inputSchema = {
  around: z
    .string()
    .optional()
    .describe(
      `指定ポケモン付近(±${AROUND_WINDOW})の素早さラインのみを返す。`,
    ),
  range: rangeSchema,
};

interface SpeedTierEntry {
  pokemon: string;
  pokemonJa: string;
  baseSpeed: number;
  finalSpeed: number;
  withJollyMax: number;
  withNeutralMax: number;
}

export interface SpeedTiersOutput {
  entries: SpeedTierEntry[];
}

/**
 * pokemon.json のエントリから @smogon/calc 用の overrides を組み立てる。
 */
function buildSpeciesOverrides(
  entry: PokemonEntry,
): NonNullable<ConstructorParameters<typeof Pokemon>[2]>["overrides"] {
  // @smogon/calc の Specie.types は文字列 union のタプル型。
  // pokemon.json では string[] で保持しているため、overrides の型要件に合わせてキャストする。
  return {
    types: entry.types,
    baseStats: entry.baseStats,
  } as NonNullable<ConstructorParameters<typeof Pokemon>[2]>["overrides"];
}

/**
 * 指定した性格・SP で Spe の実数値を計算する。
 */
function calculateSpeedStat(
  entry: PokemonEntry,
  natureEn: string,
  speEv: number,
  gen: ReturnType<typeof Generations.get>,
): number {
  const pokemon = new Pokemon(gen, entry.name, {
    nature: natureEn,
    evs: { spe: speEv },
    overrides: buildSpeciesOverrides(entry),
  });
  return pokemon.stats.spe;
}

/**
 * ポケモン名を pokemon.json エントリに解決する。
 */
function resolvePokemonEntry(name: string): PokemonEntry {
  const englishName =
    pokemonNameResolver.toEnglish(name) ??
    (pokemonNameResolver.hasEnglishName(name) ? name : null);

  if (englishName === null) {
    const suggestions = pokemonNameResolver.suggestSimilar(name);
    const suggestionMessage =
      suggestions.length > 0 ? ` もしかして: ${suggestions.join(", ")}` : "";
    throw new Error(
      `ポケモン「${name}」が見つかりません。${suggestionMessage}`,
    );
  }

  const entry = pokemonById.get(toDataId(englishName));
  if (entry === undefined) {
    throw new Error(`ポケモン「${name}」のデータが見つかりません。`);
  }
  return entry;
}

export function registerSpeedTiersTool(server: McpServer): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const gen = Generations.get(CHAMPIONS_GEN_NUM);

      // 全ポケモンの素早さデータを計算
      const allEntries: SpeedTierEntry[] = championsPokemon.map((entry) => {
        const finalSpeed = calculateSpeedStat(entry, NEUTRAL_NATURE_EN, 0, gen);
        const withNeutralMax = calculateSpeedStat(
          entry,
          NEUTRAL_NATURE_EN,
          MAX_STAT_POINT_PER_STAT,
          gen,
        );
        const withJollyMax = calculateSpeedStat(
          entry,
          JOLLY_NATURE_EN,
          MAX_STAT_POINT_PER_STAT,
          gen,
        );
        return {
          pokemon: entry.name,
          pokemonJa: entry.nameJa ?? entry.name,
          baseSpeed: entry.baseStats.spe,
          finalSpeed,
          withJollyMax,
          withNeutralMax,
        };
      });

      let filtered = allEntries;

      // around: 指定ポケモン付近（±AROUND_WINDOW）
      if (args.around !== undefined) {
        const targetEntry = resolvePokemonEntry(args.around);
        const targetSpeed = calculateSpeedStat(
          targetEntry,
          NEUTRAL_NATURE_EN,
          0,
          gen,
        );
        filtered = filtered.filter(
          (e) => Math.abs(e.finalSpeed - targetSpeed) <= AROUND_WINDOW,
        );
      }

      // range
      if (args.range !== undefined) {
        const { min, max } = args.range;
        filtered = filtered.filter((e) => {
          if (min !== undefined && e.finalSpeed < min) return false;
          if (max !== undefined && e.finalSpeed > max) return false;
          return true;
        });
      }

      // 最速性格 + 振り切り時の実数値を基本ソートキーに
      // 同値時は finalSpeed 降順のサブソート
      filtered.sort((a, b) => {
        if (b.withJollyMax !== a.withJollyMax) {
          return b.withJollyMax - a.withJollyMax;
        }
        return b.finalSpeed - a.finalSpeed;
      });

      const output: SpeedTiersOutput = { entries: filtered };

      return {
        content: [
          { type: "text" as const, text: JSON.stringify(output) },
          TOOL_RESPONSE_HINT_CONTENT,
        ],
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
