import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DamageCalculatorAdapter } from "../calc/damage-calculator.js";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../name-resolvers.js";
import { evsSchema, boostsSchema } from "./schemas/stats.js";

const pokemonSchema = z.object({
  name: z.string().describe("ポケモン名（日本語 or 英語）"),
  nature: z.string().optional().describe("性格名（省略時: まじめ）"),
  evs: evsSchema
    .optional()
    .describe("能力ポイント(SP)。各ステ 0-32、合計 0-66。省略時は全 0 (無振り)。"),
  ability: z.string().optional().describe("特性名"),
  item: z.string().optional().describe("持ち物名"),
  boosts: boostsSchema
    .optional()
    .describe("ランク補正 (-6〜+6 の整数)。省略時は全 0。いかく・ちからをつける等の変動を表現する。"),
  status: z.string().optional().describe("状態異常"),
});

const conditionsSchema = z.object({
  weather: z.string().optional().describe("天候（Sun, Rain, Sand, Hail, Snow）"),
  terrain: z.string().optional().describe("フィールド（Electric, Grassy, Misty, Psychic）"),
  isReflect: z.boolean().optional().describe("リフレクター"),
  isLightScreen: z.boolean().optional().describe("ひかりのかべ"),
  isAuroraVeil: z.boolean().optional().describe("オーロラベール"),
  isCriticalHit: z.boolean().optional().describe("急所"),
});

const damageCalcInputSchema = {
  attacker: pokemonSchema.describe("攻撃側ポケモン"),
  defender: pokemonSchema.describe("防御側ポケモン"),
  moveName: z.string().describe("技名（日本語 or 英語）"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

const TOOL_NAME = "calculate_damage_single";
const TOOL_DESCRIPTION =
  "ポケモンのダメージ計算を行うツール。攻撃側ポケモンの指定した1技が防御側ポケモンに与えるダメージを計算する。ポケモンチャンピオンズ (Pokemon Champions) の対戦仕様に対応。重要: 能力ポイント(evs) は各ステ 0-32・合計 0-66 で指定すること (従来の努力値 252/510 上限ではない)。レベル 50・個体値 31 固定。育成データは省略可能で、省略時はデフォルト値で計算される。";

export function registerDamageCalculationTool(server: McpServer): void {
  const calculator = new DamageCalculatorAdapter({
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  });

  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    damageCalcInputSchema,
    async (args) => {
      try {
        const result = calculator.calculate({
          attacker: args.attacker,
          defender: args.defender,
          moveName: args.moveName,
          conditions: args.conditions,
        });

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "不明なエラーが発生しました";
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    },
  );
}
