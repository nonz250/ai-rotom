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

- 言語: TypeScript
- パッケージ管理: npm workspaces
- 設計方針: DDD ライク

## パッケージ構成

```
packages/
├── shared/         # 共有する型定義・ドメインロジック（Domain層 + Application層）
└── mcp-server/     # MCP サーバー実装 + Infrastructure層 + データ（JSON）
```

| パッケージ | npm パッケージ名 | npm publish |
|---|---|---|
| `packages/shared` | `@ai-rotom/shared` | しない（内部用） |
| `packages/mcp-server` | `ai-rotom` | する（`npx ai-rotom`） |

### 依存方向

**MVP:**

```
mcp-server（データ内包） ──→  shared
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
- データは npm パッケージに同梱する
- データ更新時はバージョンを上げて publish する

### レイヤー構成

- **shared パッケージ**: Domain 層（model, service, repository interface）+ Application 層（use-case, dto）
- **mcp-server パッケージ**: Infrastructure 層（Repository 実装）+ server（MCP ツール）+ data（JSON）
- **将来の api-server パッケージ**: Infrastructure 層（DB Repository 実装）+ routes

```
各サーバーパッケージ（Infrastructure 層）──→  shared（Application 層  ──→  Domain 層）
```

- **Domain 層はどのレイヤーにも依存しない**
- Application 層は Domain 層に依存する
- Infrastructure 層は Domain 層に依存する（Repository interface を実装する）

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
- 入力は日本語名ベース（内部 ID への解決はプログラム側）
- 育成データは省略可能（デフォルト値あり）

## テスト

- テストフレームワーク: Vitest
- テストファイル配置: コロケーション（`*.test.ts`）
- テスト優先度 P0: DamageCalculator, StatCalculator, TypeMatchupEvaluator

## ポケモンチャンピオンズ固有ルール

- 個体値: 廃止（全ポケモン一律 31 固定、定数 `MAX_IV = 31` として扱う）
- 努力値: 「能力ポイント」に変更（実数値に直接加算）
- メガシンカ: 1試合につき1回のみ
- テラスタル: 今後追加予定（現時点では実装しない、YAGNI）
- 対戦レベル: 50 固定（定数 `DEFAULT_LEVEL = 50`）
