import { z } from "zod";
import {
  evsSchema,
  boostsSchema,
  type BoostsInput,
  type EvsInput,
} from "./stats.js";
import { MAX_MOVES_PER_MEMBER, MAX_NAME_LENGTH } from "./party.js";

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
  moves?: string[];
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

/**
 * ポケモン名・技名・タイプ名などの名前の入力スキーマ。
 */
export const nameInputSchema = z.string().max(MAX_NAME_LENGTH);

const pokemonFields = {
  name: nameInputSchema.describe("ポケモン名（日本語 or 英語）"),
  nature: nameInputSchema.optional().describe("性格名（省略時: まじめ）"),
  evs: evsSchema
    .optional()
    .describe("能力ポイント(SP)。各ステ 0-32、合計 0-66。省略時は全 0 (無振り)。"),
  ability: nameInputSchema.optional().describe("特性名"),
  item: nameInputSchema.optional().describe("持ち物名"),
  boosts: boostsSchema
    .optional()
    .describe("ランク補正 (-6〜+6 の整数)。省略時は全 0。いかく・ちからをつける等の変動を表現する。"),
  status: nameInputSchema.optional().describe("状態異常"),
};

/**
 * 技構成を使わないツール向けのポケモン入力スキーマ。
 * moves を受け付けると AI が指定を反映されたものと誤解するため、項目自体を持たない。
 */
export const pokemonSchema: z.ZodType<PokemonInput> = z.object(pokemonFields);

/**
 * 攻撃側として全技ダメ計を行うツール向けのポケモン入力スキーマ。
 */
export const pokemonWithMovesSchema: z.ZodType<PokemonInput> = z.object({
  ...pokemonFields,
  moves: z
    .array(z.string().min(1).max(MAX_NAME_LENGTH))
    .max(MAX_MOVES_PER_MEMBER, {
      message: `技は ${MAX_MOVES_PER_MEMBER} 個までです。`,
    })
    .optional()
    .describe(
      "技構成（日本語 or 英語、最大 4）。攻撃側として全技計算するときは指定した技だけを計算する。省略時は習得技すべてで計算する。",
    ),
});

export const conditionsSchema: z.ZodType<ConditionsInput> = z.object({
  weather: nameInputSchema.optional().describe("天候（Sun, Rain, Sand, Hail, Snow）"),
  terrain: nameInputSchema.optional().describe("フィールド（Electric, Grassy, Misty, Psychic）"),
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
