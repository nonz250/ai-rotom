import { z } from "zod";
import { evsSchema, boostsSchema } from "./stats.js";

export const pokemonSchema = z.object({
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

export const conditionsSchema = z.object({
  weather: z.string().optional().describe("天候（Sun, Rain, Sand, Hail, Snow）"),
  terrain: z.string().optional().describe("フィールド（Electric, Grassy, Misty, Psychic）"),
  isReflect: z.boolean().optional().describe("リフレクター"),
  isLightScreen: z.boolean().optional().describe("ひかりのかべ"),
  isAuroraVeil: z.boolean().optional().describe("オーロラベール"),
  isCriticalHit: z.boolean().optional().describe("急所"),
});
