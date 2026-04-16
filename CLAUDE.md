# ai-rotom

ポケモンチャンピオンズの対戦アドバイザー MCP サーバー。

## 設計ドキュメント

詳細な設計は `docs/design.md` を参照すること。

## 基本思想

**「プログラムは正確なデータを出す。AI はデータを元に考える。」**

| 機能 | プログラム（ツール）の責務 | AI の責務 |
|---|---|---|
| ダメージ計算 | 正確な数値計算（3粒度） | 結果の解釈・説明 |
| 選出アドバイス | タイプ相性・ダメ計・素早さ等のデータ提供 | データを総合して選出を判断・提案 |
| パーティ構築 | パーティの弱点分析 | 弱点を踏まえた構築案の提案 |

## 技術スタック

- 言語: TypeScript 6
- ダメージ計算エンジン: `@smogon/calc`（MIT ライセンス）
  - 現在は npm 未 publish のため、GitHub master からビルドしてインストール
  - npm に publish され次第、通常の依存に切り替える
- パッケージ管理: npm workspaces
- ビルド: tsdown
- テスト: Vitest
- Node.js: >= 24

## 開発コマンド

```bash
npm install          # 依存関係インストール
npm run build        # 全パッケージビルド
npm test             # テスト実行
npm run test:watch   # テスト監視モード
```

## パッケージ構成

```
packages/
├── shared/         # 共通型定義（DTO）・選出分析ロジック・パーティ弱点分析ロジック・名前変換ユーティリティ
└── mcp-server/     # MCP サーバー実装 + @smogon/calc ラッパー + 名前変換マッピングデータ
```

| パッケージ | npm パッケージ名 | npm publish |
|---|---|---|
| `packages/shared` | `@ai-rotom/shared` | しない（内部用） |
| `packages/mcp-server` | `ai-rotom` | する（`npx ai-rotom`） |

### 依存方向

**MVP:**

```
mcp-server ──→ shared
mcp-server ──→ @smogon/calc
```

**将来（API サーバー追加時）:**

```
mcp-server  ──HTTP──→  api-server  ──→  DB
     │                      │
     └──depends──→  shared  ←──depends──┘
```

逆方向の依存は禁止。

### 配布方法

- `npx ai-rotom` で MCP サーバーを起動できる
- 名前変換マッピングデータは npm パッケージに同梱する
- データ更新時はバージョンを上げて publish する

### パッケージの役割

- **shared パッケージ**: 共通型定義（DTO）・分析ロジック（選出分析・パーティ分析・素早さ比較）・名前変換ユーティリティ
- **mcp-server パッケージ**: MCP ツール定義 + `@smogon/calc` のラッパー + 名前変換マッピングデータ（JSON）
- **将来の api-server パッケージ**: REST API ルート

```
mcp-server ──→ shared（型定義 + 分析ロジック）
mcp-server ──→ @smogon/calc（ダメージ計算）
```

- shared は外部ライブラリに依存しない
- ダメージ計算・ステータス計算・タイプ相性評価は `@smogon/calc` に委譲する

## IMPORTANT: 外部サービス名の取り扱い

**データ取得元の外部サービス名（API 名・サイト名）をドキュメント・コミットメッセージ・PR 説明に記載しないこと。**
設計ドキュメントやコード内コメントでは「外部 API」「攻略サイト」等の一般的な表現を使うこと。

## MCP ツール

| ツール名 | 概要 |
|---|---|
| `calculate_damage_single` | 1対1の1技のダメージ計算 |
| `calculate_damage_all_moves` | 1対1の全技のダメージ計算 |
| `calculate_damage_party_matchup` | パーティ対パーティのダメージ計算 |
| `analyze_selection` | 選出判断の一括分析 |
| `analyze_party_weakness` | パーティの弱点分析 |

- MCP SDK: `@modelcontextprotocol/sdk`
- 入力は日本語名ベース（英語名への変換はプログラム側で `@smogon/calc` に渡す）
- 育成データは省略可能（デフォルト値あり）

## テスト

- テストフレームワーク: Vitest
- テストファイル配置: コロケーション（`*.test.ts`）
- テスト優先度 P0: `@smogon/calc` ラッパーの統合テスト、NameResolver
- テスト優先度 P1: 名前変換マッピングデータの整合性、SelectionAnalyzer、PartyAnalyzer
- `@smogon/calc` 自体のテストは不要（ライブラリ側でテスト済み）

## ポケモンチャンピオンズ固有ルール

- 個体値: 廃止（全ポケモン一律 31 固定、定数 `MAX_IV = 31` として扱う）
- 能力ポイント(SP): 旧「努力値(EV)」から仕様変更。各ステ 0〜32（定数 `MAX_STAT_POINT_PER_STAT = 32`）、合計 0〜66（定数 `MAX_STAT_POINT_TOTAL = 66`）。1 SP = 実数値 +1 で直接加算される（従来 EV の 4 EV = +1 とは別仕様）
- メガシンカ: 1試合につき1回のみ
- テラスタル: 今後追加予定（現時点では実装しない、YAGNI）
- 対戦レベル: 50 固定（定数 `DEFAULT_LEVEL = 50`）
