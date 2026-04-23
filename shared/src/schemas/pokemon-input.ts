import { z } from "zod";
import {
  evsSchema,
  boostsSchema,
  type BoostsInput,
  type EvsInput,
} from "./stats.js";

/**
 * ポケモン入力の型。各ツールの入力で共通利用する。
 */
export type PokemonInput = {
  name: string;
  nature?: string;
  evs?: EvsInput;
  ability?: string;
  item?: string;
  boosts?: BoostsInput;
  status?: string;
};

/**
 * バトル条件の入力型。
 */
export type ConditionsInput = {
  weather?: string;
  terrain?: string;
  battleFormat?: "singles" | "doubles";
  isReflect?: boolean;
  isLightScreen?: boolean;
  isAuroraVeil?: boolean;
  isCriticalHit?: boolean;
};

export const pokemonSchema: z.ZodType<PokemonInput> = z.object({
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

export const conditionsSchema: z.ZodType<ConditionsInput> = z.object({
  weather: z.string().optional().describe("天候（Sun, Rain, Sand, Hail, Snow）"),
  terrain: z.string().optional().describe("フィールド（Electric, Grassy, Misty, Psychic）"),
  battleFormat: z
    .enum(["singles", "doubles"])
    .optional()
    .describe(
      "対戦形式（シングル: singles / ダブル: doubles）。省略時は singles。doubles 指定時は全体攻撃技 (じしん/ねっぷう等) の威力が ×0.75 され、壁系の軽減率が約 0.667 倍に変わる。",
    ),
  isReflect: z.boolean().optional().describe("リフレクター"),
  isLightScreen: z.boolean().optional().describe("ひかりのかべ"),
  isAuroraVeil: z.boolean().optional().describe("オーロラベール"),
  isCriticalHit: z.boolean().optional().describe("急所"),
});
