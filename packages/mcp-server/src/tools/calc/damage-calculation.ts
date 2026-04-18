import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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

const damageCalcInputSchema = {
  attacker: pokemonSchema.describe("攻撃側ポケモン"),
  defender: pokemonSchema.describe("防御側ポケモン"),
  moveName: z.string().describe("技名（日本語 or 英語）"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

const SINGLE_TOOL_NAME = "calculate_damage_single";
const SINGLE_TOOL_DESCRIPTION =
  "ポケモンのダメージ計算を行うツール。攻撃側ポケモンの指定した1技が防御側ポケモンに与えるダメージを計算する。ポケモンチャンピオンズ (Pokemon Champions) の対戦仕様に対応。重要: 能力ポイント(evs) は各ステ 0-32・合計 0-66 で指定すること (従来の努力値 252/510 上限ではない)。レベル 50・個体値 31 固定。育成データは省略可能で、省略時はデフォルト値で計算される。";

const ALL_MOVES_TOOL_NAME = "calculate_damage_all_moves";
const ALL_MOVES_TOOL_DESCRIPTION =
  "ポケモン対戦で攻撃側ポケモンの全攻撃技のダメージを一括計算する。どの技が最も有効かを比較するときに使用する。ポケモンチャンピオンズ対応。";

const allMovesInputSchema = {
  attacker: pokemonSchema.describe("攻撃側ポケモン"),
  defender: pokemonSchema.describe("防御側ポケモン"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

const PARTY_MATCHUP_TOOL_NAME = "calculate_damage_party_matchup";
const PARTY_MATCHUP_TOOL_DESCRIPTION =
  "パーティ対パーティの全組み合わせダメージ計算を行う。6vs6の全対面での火力関係を一覧する。ポケモン対戦の選出判断やパーティ構築の検討に使用する。";

const partyMatchupInputSchema = {
  myParty: z.array(pokemonSchema).describe("自分のパーティ"),
  opponentParty: z.array(pokemonSchema).describe("相手のパーティ"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

interface PartyMatchupBestMove {
  defender: string;
  defenderNameJa: string;
  bestMove: string;
  bestMoveJa: string;
  maxDamagePercent: number;
  koChance: string;
}

interface PartyMatchupAttacker {
  attacker: string;
  attackerNameJa: string;
  results: PartyMatchupBestMove[];
}

interface PartyMatchupOutput {
  myParty: string[];
  opponentParty: string[];
  matchups: PartyMatchupAttacker[];
}

function createCalculator(): DamageCalculatorAdapter {
  return new DamageCalculatorAdapter({
    pokemon: pokemonNameResolver,
    move: moveNameResolver,
    ability: abilityNameResolver,
    item: itemNameResolver,
    nature: natureNameResolver,
  });
}

function formatErrorResponse(error: unknown): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  const message =
    error instanceof Error ? error.message : "不明なエラーが発生しました";
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

function extractBestMove(
  results: DamageCalcResult[],
  defenderNameEn: string,
  moveResolver: typeof moveNameResolver,
): PartyMatchupBestMove {
  const best = results[0];
  const defenderNameJa =
    pokemonNameResolver.toJapanese(defenderNameEn) ?? defenderNameEn;
  const bestMoveJa =
    moveResolver.toJapanese(best.move) ?? best.move;

  return {
    defender: defenderNameEn,
    defenderNameJa,
    bestMove: best.move,
    bestMoveJa,
    maxDamagePercent: best.maxPercent,
    koChance: best.koChance,
  };
}

export function registerDamageCalculationTools(server: McpServer): void {
  const calculator = createCalculator();

  // ツール1: calculate_damage_single
  server.tool(
    SINGLE_TOOL_NAME,
    SINGLE_TOOL_DESCRIPTION,
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
        return formatErrorResponse(error);
      }
    },
  );

  // ツール2: calculate_damage_all_moves
  server.tool(
    ALL_MOVES_TOOL_NAME,
    ALL_MOVES_TOOL_DESCRIPTION,
    allMovesInputSchema,
    async (args) => {
      try {
        const results = calculator.calculateAllMoves({
          attacker: args.attacker,
          defender: args.defender,
          conditions: args.conditions,
        });

        const attackerNameEn =
          pokemonNameResolver.toEnglish(args.attacker.name) ??
          (pokemonNameResolver.hasEnglishName(args.attacker.name)
            ? args.attacker.name
            : args.attacker.name);
        const defenderNameEn =
          pokemonNameResolver.toEnglish(args.defender.name) ??
          (pokemonNameResolver.hasEnglishName(args.defender.name)
            ? args.defender.name
            : args.defender.name);

        const output = {
          attacker: results.length > 0 ? results[0].attacker : attackerNameEn,
          defender: results.length > 0 ? results[0].defender : defenderNameEn,
          results,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
        };
      } catch (error: unknown) {
        return formatErrorResponse(error);
      }
    },
  );

  // ツール3: calculate_damage_party_matchup
  server.tool(
    PARTY_MATCHUP_TOOL_NAME,
    PARTY_MATCHUP_TOOL_DESCRIPTION,
    partyMatchupInputSchema,
    async (args) => {
      try {
        const output: PartyMatchupOutput = {
          myParty: [],
          opponentParty: [],
          matchups: [],
        };

        // パーティ名の解決
        for (const member of args.opponentParty) {
          const nameEn =
            pokemonNameResolver.toEnglish(member.name) ??
            (pokemonNameResolver.hasEnglishName(member.name)
              ? member.name
              : member.name);
          const nameJa =
            pokemonNameResolver.toJapanese(nameEn) ?? nameEn;
          output.opponentParty.push(nameJa);
        }

        // 全 attacker x defender の組み合わせ
        for (const attacker of args.myParty) {
          const { resolvedName: attackerNameEn } =
            calculator.createPokemonObject(attacker);
          const attackerNameJa =
            pokemonNameResolver.toJapanese(attackerNameEn) ?? attackerNameEn;

          output.myParty.push(attackerNameJa);

          const attackerEntry: PartyMatchupAttacker = {
            attacker: attackerNameEn,
            attackerNameJa,
            results: [],
          };

          for (const defender of args.opponentParty) {
            const results = calculator.calculateAllMoves({
              attacker,
              defender,
              conditions: args.conditions,
            });

            if (results.length > 0) {
              const defenderNameEn = results[0].defender;
              attackerEntry.results.push(
                extractBestMove(results, defenderNameEn, moveNameResolver),
              );
            }
          }

          output.matchups.push(attackerEntry);
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
        };
      } catch (error: unknown) {
        return formatErrorResponse(error);
      }
    },
  );
}
