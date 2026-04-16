import {
  MAX_STAT_POINT_PER_STAT,
  MAX_STAT_POINT_TOTAL,
} from "@ai-rotom/shared";

export const SERVER_INSTRUCTIONS = `
ai-rotom はポケモンチャンピオンズ (Pokemon Champions) の対戦アドバイザー MCP サーバーです。
以下の固有仕様に従って入力を組み立ててください。従来シリーズ (SV 等) の知識をそのまま流用すると誤った結果になります。

## 能力ポイント (SP) について

- 従来の「努力値 (EV)」は廃止され、「能力ポイント (SP)」という仕様に変更されました。
- 各ステータス (hp/atk/def/spa/spd/spe) あたりの上限: ${MAX_STAT_POINT_PER_STAT} SP
- 全ステータス合計の上限: ${MAX_STAT_POINT_TOTAL} SP
- 1 SP = 実数値 +1 で直接加算されます (従来 EV の「4 EV = 実数値 +1」ではありません)。
- 各ステ 0〜${MAX_STAT_POINT_PER_STAT}、合計 0〜${MAX_STAT_POINT_TOTAL} の範囲内なら振り方は自由です。
- 従来の 252 EV / 510 EV 合計上限をそのまま渡すとエラーになります。

## その他の固有仕様

- 個体値 (IV): 廃止。全ポケモン一律 31 固定として扱われます。
- 対戦レベル: 50 固定。
- メガシンカ: 1試合につき1回のみ使用可能。
- テラスタル: 未対応 (ゲーム側で未実装のため)。

## 推奨される使い方

- ポケモン情報の確認: get_pokemon_info / search_pokemon
- 特定の技のダメージ計算: calculate_damage_single
- 育成データが不明な場合は evs・nature・ability 等を省略してよい (デフォルト値で計算)
`.trim();
