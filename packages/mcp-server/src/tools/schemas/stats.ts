import { z } from "zod";
import {
  MAX_STAT_POINT_PER_STAT,
  MAX_STAT_POINT_TOTAL,
} from "@ai-rotom/shared";

const statPointValueSchema = z
  .number({ message: "能力ポイント(SP)は数値で指定してください。" })
  .int({ message: "能力ポイント(SP)は整数で指定してください。" })
  .finite()
  .min(0, { message: "能力ポイント(SP)は 0 以上で指定してください。" })
  .max(MAX_STAT_POINT_PER_STAT, {
    message: `能力ポイント(SP)は各ステータス ${MAX_STAT_POINT_PER_STAT} 以下です (ポケモンチャンピオンズ仕様)。`,
  });

/**
 * 能力ポイント(SP) のスキーマ。
 * ポケモンチャンピオンズ仕様: 各ステ 0〜MAX_STAT_POINT_PER_STAT、
 * 合計 0〜MAX_STAT_POINT_TOTAL の範囲。
 * 従来の EV (各 252 / 合計 510) とは別仕様なので AI クライアントが
 * 旧知識で 252 等を渡してきた場合に弾く。
 */
export const evsSchema = z
  .object({
    hp: statPointValueSchema.optional(),
    atk: statPointValueSchema.optional(),
    def: statPointValueSchema.optional(),
    spa: statPointValueSchema.optional(),
    spd: statPointValueSchema.optional(),
    spe: statPointValueSchema.optional(),
  })
  .refine(
    (evs) => {
      const total = Object.values(evs).reduce<number>(
        (sum, v) => sum + (v ?? 0),
        0,
      );
      return total <= MAX_STAT_POINT_TOTAL;
    },
    {
      message: `能力ポイント(SP)の合計は ${MAX_STAT_POINT_TOTAL} 以下でなければなりません (ポケモンチャンピオンズ仕様)。各ステ ${MAX_STAT_POINT_PER_STAT} 上限・合計 ${MAX_STAT_POINT_TOTAL} 上限です。従来の努力値(EV)の 252/510 上限ではありません。`,
    },
  );

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
