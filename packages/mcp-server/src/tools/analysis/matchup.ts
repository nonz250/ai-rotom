import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DamageCalcResult } from "../../calc/damage-calculator.js";
import { DamageCalculatorAdapter } from "../../calc/damage-calculator.js";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../../name-resolvers.js";
import { pokemonSchema, conditionsSchema } from "../schemas/pokemon-input.js";

const TOOL_NAME = "analyze_matchup";
const TOOL_DESCRIPTION =
  "ポケモン2体の対面を分析する。双方向のダメージ計算と素早さ比較を行い、どちらが有利かを判断するためのデータを提供する。ポケモン対戦の対面判断に使用する。";

const matchupInputSchema = {
  pokemon1: pokemonSchema.describe("ポケモン1"),
  pokemon2: pokemonSchema.describe("ポケモン2"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

interface MatchupPokemonInfo {
  name: string;
  nameJa: string;
  speed: number;
}

interface MatchupOutput {
  pokemon1: MatchupPokemonInfo;
  pokemon2: MatchupPokemonInfo;
  pokemon1Faster: boolean;
  pokemon1Attacks: DamageCalcResult[];
  pokemon2Attacks: DamageCalcResult[];
}

export function registerMatchupTool(server: McpServer): void {
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
    matchupInputSchema,
    async (args) => {
      try {
        // 素早さを取得するために Pokemon オブジェクトを生成
        const { pokemon: p1, resolvedName: name1 } =
          calculator.createPokemonObject(args.pokemon1);
        const { pokemon: p2, resolvedName: name2 } =
          calculator.createPokemonObject(args.pokemon2);

        const nameJa1 =
          pokemonNameResolver.toJapanese(name1) ?? name1;
        const nameJa2 =
          pokemonNameResolver.toJapanese(name2) ?? name2;

        // 双方向のダメージ計算
        const pokemon1Attacks = calculator.calculateAllMoves({
          attacker: args.pokemon1,
          defender: args.pokemon2,
          conditions: args.conditions,
        });

        const pokemon2Attacks = calculator.calculateAllMoves({
          attacker: args.pokemon2,
          defender: args.pokemon1,
          conditions: args.conditions,
        });

        const output: MatchupOutput = {
          pokemon1: {
            name: name1,
            nameJa: nameJa1,
            speed: p1.stats.spe,
          },
          pokemon2: {
            name: name2,
            nameJa: nameJa2,
            speed: p2.stats.spe,
          },
          pokemon1Faster: p1.stats.spe > p2.stats.spe,
          pokemon1Attacks,
          pokemon2Attacks,
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
