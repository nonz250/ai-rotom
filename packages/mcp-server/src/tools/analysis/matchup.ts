import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DamageCalculatorAdapter,
  calculateTypeEffectiveness,
  compareSpeed,
  conditionsSchema,
  pokemonSchema,
} from "@ai-rotom/shared";
import type { DamageCalcResult } from "@ai-rotom/shared";
import { Generations } from "@smogon/calc";
import type { TypeName } from "@smogon/calc/dist/data/interface";
import { pokemonEntryProvider } from "../../data-store.js";
import {
  pokemonNameResolver,
  moveNameResolver,
  abilityNameResolver,
  itemNameResolver,
  natureNameResolver,
} from "../../name-resolvers.js";

const TOOL_NAME = "analyze_matchup";
const TOOL_DESCRIPTION =
  "ポケモン2体の対面を分析する。双方向のダメージ計算と素早さ比較を行い、どちらが有利かを判断するためのデータを提供する。ポケモン対戦の対面判断に使用する。正確な計算のため双方の ability / item の指定を推奨（省略時は通常特性・持ち物なし扱い）。";

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

interface MatchupTypeSummary {
  /** pokemon1 のタイプ（種族タイプ）で取れる最大相性倍率 */
  p1ToP2MaxByPokemonType: number;
  /** pokemon2 のタイプ（種族タイプ）で取れる最大相性倍率 */
  p2ToP1MaxByPokemonType: number;
}

interface MatchupOutput {
  pokemon1: MatchupPokemonInfo;
  pokemon2: MatchupPokemonInfo;
  pokemon1Faster: boolean;
  pokemon1Attacks: DamageCalcResult[];
  pokemon2Attacks: DamageCalcResult[];
  typeSummary: MatchupTypeSummary;
}

/**
 * 攻撃側タイプ配列から防御側タイプ配列への最大相性倍率を返す。
 * 攻撃側は自身のタイプ（種族タイプ）の技を出せる前提で、その中の最大値。
 * 将来的に selection-analysis 側と共通化する予定（#14 スコープ外）。
 */
function maxTypeMultiplier(
  attackerTypes: readonly string[],
  defenderTypes: readonly string[],
  gen: ReturnType<typeof Generations.get>,
): number {
  let max = 0;
  const defenders = defenderTypes as readonly TypeName[];
  for (const attackTypeName of attackerTypes) {
    const multiplier = calculateTypeEffectiveness(
      gen,
      attackTypeName as TypeName,
      defenders,
    );
    if (multiplier > max) {
      max = multiplier;
    }
  }
  return max;
}

export function registerMatchupTool(server: McpServer): void {
  const calculator = new DamageCalculatorAdapter(
    {
      pokemon: pokemonNameResolver,
      move: moveNameResolver,
      ability: abilityNameResolver,
      item: itemNameResolver,
      nature: natureNameResolver,
    },
    pokemonEntryProvider,
  );

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

        const gen = calculator.getGen();
        const typeSummary: MatchupTypeSummary = {
          p1ToP2MaxByPokemonType: maxTypeMultiplier(p1.types, p2.types, gen),
          p2ToP1MaxByPokemonType: maxTypeMultiplier(p2.types, p1.types, gen),
        };

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
          pokemon1Faster: compareSpeed(p1.stats.spe, p2.stats.spe) === "faster",
          pokemon1Attacks,
          pokemon2Attacks,
          typeSummary,
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
