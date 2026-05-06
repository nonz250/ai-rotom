import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { conditionsSchema, pokemonSchema } from "@ai-rotom/shared";
import { createDamageCalculator } from "../../services/calculator-factory.js";
import { calculateWithProtection } from "../../services/protection.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const TOOL_NAME = "calculate_damage_with_protection";
const TOOL_DESCRIPTION =
  "防御側がマルチスケイル / ばけのかわ / きあいのタスキを持つ場合の累積ダメージ判定を行う。1 発目 + 2 発目を計算し、累積 % と確定 2 発 / 乱数 2 発 / 確 2 圏外 の判定を返す。calculate_damage_single の単発結果だけを見て「確 3 圏」と読んでしまう典型ミスを構造的に防ぐ。マルスケ持ちカイリュー等への打点評価で必ず使うこと。";

const inputSchema = {
  attacker: pokemonSchema.describe("攻撃側ポケモン"),
  defender: pokemonSchema.describe("防御側ポケモン"),
  moveName: z.string().describe("技名（日本語 or 英語）"),
  conditions: conditionsSchema.optional().describe("バトル条件"),
};

const calculator = createDamageCalculator();

interface FirstHitOutput {
  range: string;
  ko: string;
  typeMult: number;
  minPct: number;
  maxPct: number;
  effectiveRange?: string;
  effectiveMinPct?: number;
  effectiveMaxPct?: number;
}

export function registerCalculateDamageWithProtectionTool(
  server: McpServer,
): void {
  server.tool(TOOL_NAME, TOOL_DESCRIPTION, inputSchema, async (args) => {
    try {
      const calc = calculateWithProtection(
        calculator,
        args.attacker,
        args.defender,
        args.moveName,
        args.conditions,
      );

      const firstHit: FirstHitOutput = {
        range:
          calc.firstHit.typeMultiplier === 0
            ? "無効"
            : `${calc.firstHit.minPercent.toFixed(1)}-${calc.firstHit.maxPercent.toFixed(1)}%`,
        ko: calc.firstHit.koChance,
        typeMult: calc.firstHit.typeMultiplier,
        minPct: calc.firstHit.minPercent,
        maxPct: calc.firstHit.maxPercent,
      };
      if (calc.effRangeLabel !== undefined) {
        firstHit.effectiveRange = calc.effRangeLabel;
        firstHit.effectiveMinPct = calc.effMin;
        firstHit.effectiveMaxPct = calc.effMax;
      } else if (calc.firstHit.typeMultiplier === 0) {
        firstHit.effectiveRange = "無効";
      }

      const out = {
        firstHit,
        secondHit: calc.secondHit
          ? {
              range: `${calc.secondHit.minPercent.toFixed(1)}-${calc.secondHit.maxPercent.toFixed(1)}%`,
              ko: calc.secondHit.koChance,
              typeMult: calc.secondHit.typeMultiplier,
              minPct: calc.secondHit.minPercent,
              maxPct: calc.secondHit.maxPercent,
            }
          : null,
        accumulated: calc.accumulated ?? null,
        protection: calc.protection ?? null,
      };
      return withHint({ type: "text" as const, text: JSON.stringify(out) });
    } catch (error) {
      return toErrorResponse(error);
    }
  });
}
