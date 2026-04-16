import { z } from "zod";

/**
 * 能力ポイント(SP) のスキーマ。
 * この段階では値域の厳格化はせず、純粋に evs と boosts を分離する目的のみ。
 * SP の範囲・合計バリデーションは後続コミットで追加する。
 */
export const evsSchema = z.object({
  hp: z.number().optional(),
  atk: z.number().optional(),
  def: z.number().optional(),
  spa: z.number().optional(),
  spd: z.number().optional(),
  spe: z.number().optional(),
});

const MAX_STAT_BOOST = 6;
const MIN_STAT_BOOST = -6;

const boostValueSchema = z
  .number()
  .int()
  .finite()
  .min(MIN_STAT_BOOST)
  .max(MAX_STAT_BOOST);

/**
 * ランク補正 (いかく・ちからをつける等) のスキーマ。
 * 各ステータスは -6〜+6 の整数のみ許可する。
 */
export const boostsSchema = z.object({
  hp: boostValueSchema.optional(),
  atk: boostValueSchema.optional(),
  def: boostValueSchema.optional(),
  spa: boostValueSchema.optional(),
  spd: boostValueSchema.optional(),
  spe: boostValueSchema.optional(),
});
