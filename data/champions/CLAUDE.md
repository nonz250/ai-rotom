# data/champions/

ポケモンチャンピオンズのマスターデータ。

## 位置付け

- 攻略サイトと突合済みの正データ
- mcp-server から `@data/*` alias で参照される
- 将来の api-server / web-ui からも共有する資産

## ファイル構成

| ファイル | 役割 | 件数目安 |
|---|---|---|
| `pokemon.json` | ポケモン (種族値・タイプ・特性・重さ) | 285 |
| `abilities.json` | 特性 (英日名 + 効果説明) | 213 |
| `items.json` | 持ち物 (メガストーン情報含む) | 117 |
| `moves.json` | 技 (威力・命中・PP・タイプ・フラグ等) | 496 |
| `learnsets.json` | ポケモン ID → 技 ID 配列 | 209 species |
| `natures.json` | 性格 (plus / minus) | 25 |
| `types.json` | タイプの日英マッピング | 18 |
| `conditions.json` | 天候 / フィールド / 状態異常 / 壁 | 4 カテゴリ |

## 優先順位（データが食い違う場合）

1. **実ゲーム画面**（最優先）
2. **攻略サイト**（このリポジトリが基準にしているソース）
3. `@smogon/calc` Gen 0 (Champions)

## スキーマ

各エントリの型は `@ai-rotom/shared` の `types/pokemon.ts` および
mcp-server の `data-store.ts` に定義されている。JSON を編集する際は
これらの型と整合を取ること。

## 編集時の注意

- **id 命名規則**: `toID` 相当（小文字英数字のみ、記号・空白除去）
  例: `"Charizard-Mega-X"` → `"charizardmegax"`、`"Acid Spray"` → `"acidspray"`
- **日本語名の表記**: 全角英数字（例: `ＤＤラリアット`、`１０まんボルト`）と
  漢字 + 全角中点（例: `ひけん・ちえなみ`）を採用
- **nameJa**: 攻略サイトに日本語名があるものは必ず入れる。不明な場合のみ `null` 可
- **重複禁止**: 同一 id は 1 エントリのみ
- **相互参照の整合性**:
  - `pokemon.baseSpecies` / `pokemon.otherFormes` → `pokemon.json` に対応エントリが存在
  - `items.megaStone` / `items.megaEvolves` → `pokemon.json` に対応エントリが存在
  - `learnsets` のキー → `pokemon.json` の id に存在
  - `learnsets` の技 ID → `moves.json` に存在

## `@smogon/calc` との同期

- `@smogon/calc` Gen 0 にあって攻略サイトに無いエントリ（戦闘中フォーム等）は
  `pokemon.json` から削除する（攻略サイトの粒度に揃える）
- 攻略サイトのデータを正として訂正する場合は、scripts の再生成ではなく
  **直接 JSON を編集**する（scripts は削除済み）

## 仕様差分の取り扱い

- メガシンカの特性・種族値は攻略サイト準拠で上書き済み
- 実行時は pokemon.json の値を `@smogon/calc` に overrides で注入するため、
  計算にも正しく反映される（`PokemonEntryProvider` 経由）
