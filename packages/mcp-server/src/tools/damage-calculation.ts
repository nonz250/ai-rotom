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

const statsSchema = z.object({
  hp: z.number().optional(),
  atk: z.number().optional(),
  def: z.number().optional(),
  spa: z.number().optional(),
  spd: z.number().optional(),
  spe: z.number().optional(),
});

const pokemonSchema = z.object({
  name: z.string().describe("ポケモン名（日本語 or 英語）"),
  nature: z.string().optional().describe("性格名（省略時: まじめ）"),
  evs: statsSchema.optional().describe("能力ポイント（省略時: 全0）"),
  ability: z.string().optional().describe("特性名"),
  item: z.string().optional().describe("持ち物名"),
  boosts: statsSchema.optional().describe("ランク補正（省略時: 全0）"),
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
  "1対1の1技のダメージ計算を行う。攻撃側ポケモンの指定した1技が防御側ポケモンに与えるダメージを計算する。";

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
