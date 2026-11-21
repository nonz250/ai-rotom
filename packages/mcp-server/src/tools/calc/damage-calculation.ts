import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  conditionsSchema,
  pokemonSchema,
  pokemonWithMovesSchema,
  summarizeMoveDamages,
} from "@ai-rotom/shared";
import type { DamageCalcResult } from "@ai-rotom/shared";
import { damageCalculator } from "../../calc/damage-calculator.js";
import {
  pokemonNameResolver,
  moveNameResolver,
} from "../../name-resolvers.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const damageCalcInputSchema = {
  attacker: pokemonSchema.describe("攻撃側ポケモン"),
  defender: pokemonSchema.describe("防御側ポケモン"),
  moveName: z.string().describe("技名（日本語 or 英語）"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

const SINGLE_TOOL_NAME = "calculate_damage_single";
const SINGLE_TOOL_DESCRIPTION =
  "ポケモンのダメージ計算を行うツール。攻撃側ポケモンの指定した1技が防御側ポケモンに与えるダメージを計算する。ポケモンチャンピオンズ (Pokemon Champions) の対戦仕様に対応。重要: 能力ポイント(evs) は各ステ 0-32・合計 0-66 で指定すること (従来の努力値 252/510 上限ではない)。レベル 50・個体値 31 固定。育成データは省略可能で、省略時はデフォルト値で計算される。正確な計算のため攻撃側・防御側の ability / item の指定を推奨（省略時は通常特性・持ち物なし扱い）。";

const ALL_MOVES_TOOL_NAME = "calculate_damage_all_moves";
const ALL_MOVES_TOOL_DESCRIPTION =
  "ポケモン対戦で攻撃側ポケモンの全攻撃技のダメージを一括計算する。どの技が最も有効かを比較するときに使用する。技ごとの結果はタイプ・相性・ダメージ割合・確定数の要約で、乱数の内訳は含まない。計算条件の説明文は最大打点の技にだけ付く。1 技の詳しい結果は calculate_damage_single で確認する。ポケモンチャンピオンズ対応。正確な計算のため攻撃側・防御側の ability / item の指定を推奨（省略時は通常特性・持ち物なし扱い）。";

const allMovesInputSchema = {
  attacker: pokemonWithMovesSchema.describe("攻撃側ポケモン"),
  defender: pokemonSchema.describe("防御側ポケモン"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

const PARTY_MATCHUP_TOOL_NAME = "calculate_damage_party_matchup";
const PARTY_MATCHUP_TOOL_DESCRIPTION =
  "パーティ対パーティの全組み合わせダメージ計算を行う。6vs6の全対面での火力関係を一覧する。ポケモン対戦の選出判断やパーティ構築の検討に使用する。正確な計算のため各ポケモンの ability / item の指定を推奨（省略時は通常特性・持ち物なし扱い）。";

const partyMatchupInputSchema = {
  myParty: z.array(pokemonWithMovesSchema).describe("自分のパーティ"),
  opponentParty: z.array(pokemonSchema).describe("相手のパーティ"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

/** ダメージを与えられる技がない対面の最大ダメージ割合。 */
const NO_DAMAGE_PERCENT = 0;

interface PartyMatchupBestMove {
  defender: string;
  defenderNameJa: string;
  /** ダメージを与えられる技がない対面では null */
  bestMove: string | null;
  bestMoveJa: string | null;
  maxDamagePercent: number;
  koChance: string | null;
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

function extractBestMove(
  results: DamageCalcResult[],
  defenderNameEn: string,
  moveResolver: typeof moveNameResolver,
): PartyMatchupBestMove {
  const defenderNameJa =
    pokemonNameResolver.toJapanese(defenderNameEn) ?? defenderNameEn;
  if (results.length === 0) {
    return {
      defender: defenderNameEn,
      defenderNameJa,
      bestMove: null,
      bestMoveJa: null,
      maxDamagePercent: NO_DAMAGE_PERCENT,
      koChance: null,
    };
  }
  const best = results[0];
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
  // ツール1: calculate_damage_single
  server.tool(
    SINGLE_TOOL_NAME,
    SINGLE_TOOL_DESCRIPTION,
    damageCalcInputSchema,
    async (args) => {
      try {
        const result = damageCalculator.calculate({
          attacker: args.attacker,
          defender: args.defender,
          moveName: args.moveName,
          conditions: args.conditions,
        });

        return withHint({ type: "text" as const, text: JSON.stringify(result) });
      } catch (error: unknown) {
        return toErrorResponse(error);
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
        const results = damageCalculator.calculateAllMoves({
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
          results: summarizeMoveDamages(results, (en) =>
            moveNameResolver.toJapanese(en),
          ),
        };

        return withHint({ type: "text" as const, text: JSON.stringify(output) });
      } catch (error: unknown) {
        return toErrorResponse(error);
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
            damageCalculator.createPokemonObject(attacker);
          const attackerNameJa =
            pokemonNameResolver.toJapanese(attackerNameEn) ?? attackerNameEn;

          output.myParty.push(attackerNameJa);

          const attackerEntry: PartyMatchupAttacker = {
            attacker: attackerNameEn,
            attackerNameJa,
            results: [],
          };

          for (const defender of args.opponentParty) {
            const results = damageCalculator.calculateAllMoves({
              attacker,
              defender,
              conditions: args.conditions,
            });

            const { resolvedName: defenderNameEn } =
              damageCalculator.createPokemonObject(defender);
            attackerEntry.results.push(
              extractBestMove(results, defenderNameEn, moveNameResolver),
            );
          }

          output.matchups.push(attackerEntry);
        }

        return withHint({ type: "text" as const, text: JSON.stringify(output) });
      } catch (error: unknown) {
        return toErrorResponse(error);
      }
    },
  );
}
