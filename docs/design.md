# ai-rotom 設計ドキュメント

## 1. プロジェクト概要

### 1.1 プロダクト概要

| 項目 | 内容 |
|---|---|
| プロダクト名 | ai-rotom |
| 対象ゲーム | ポケモンチャンピオンズ（Pokémon Champions） |
| プラットフォーム | Nintendo Switch |
| ゲーム発売日 | 2026年4月8日 |

ai-rotom は、ポケモンチャンピオンズの対戦をナビゲートする AI アドバイザー MCP サーバーである。ポケモンのロトム（Rotom）のように、プレイヤーの対戦を総合的にサポートする。

### 1.2 対象ユーザー

初心者から競技志向のプレイヤー（ガチ勢）まで、すべてのプレイヤーを対象とする。

### 1.3 核心価値

ダメージ計算・選出アドバイス・パーティ構築支援を **すべて網羅する総合アドバイザー** として機能する。個別のツールを使い分ける必要をなくし、ロトム1体にすべてを任せられる体験を提供する。

### 1.4 対応バトル形式

- シングルバトル
- ダブルバトル

### 1.5 ポケモンチャンピオンズのゲームシステム

ポケモンチャンピオンズでは、過去作（ポケモン SV 等）から以下の点が変更されている。ai-rotom のドメインロジックはこれらの仕様に基づいて設計する。

#### ステータス関連

| 項目 | 従来（SV 等） | チャンピオンズ |
|---|---|---|
| 個体値 | 0〜31 の個体差あり | 廃止（全ポケモン一律 31 固定） |
| 努力値 | 0〜252（合計 510） | 「能力ポイント」に変更（実数値に直接加算） |
| 性格補正 | ミント等で変更 | VP 消費でいつでも変更可能 |

#### バトルシステム

| 項目 | 内容 |
|---|---|
| メガシンカ | 復活（1試合につき1回のみ使用可能） |
| テラスタル | 今後追加予定（現時点では未実装） |
| 相手 HP 表示 | パーセンテージ表示 |

#### タイプ相性表記

| 倍率 | 従来の表記 | チャンピオンズの表記 |
|---|---|---|
| 4倍 | こうかはバツグンだ | こうかちょうバツグン |
| 2倍 | こうかはバツグンだ | こうかはバツグンだ |
| 0.5倍 | こうかはいまひとつ | こうかはいまひとつ |
| 0.25倍 | こうかはいまひとつ | かなりいまひとつ |
| 0倍 | こうかがないみたい | こうかがないみたい |

### 1.6 技術スタック・アーキテクチャ方針

| 項目 | 方針 |
|---|---|
| 実装言語 | TypeScript |
| リポジトリ構成 | monorepo（packages/data + packages/core + packages/mcp-server） |
| パッケージ管理 | npm workspaces |
| データソース | JSON / TypeScript でパッケージにバンドル（外部 DB 不使用） |
| 動作環境 | ローカル完結 |
| 拡張性 | 将来的に API / Web UI の追加を想定した構造にする |

```
ai-rotom/
├── packages/
│   ├── data/           # ポケモンデータ
│   ├── core/           # ドメインロジック
│   └── mcp-server/     # MCP サーバー実装
├── docs/
│   └── design.md       # 本ドキュメント
└── package.json        # workspaces ルート
```

---

## 2. アーキテクチャ設計

### 2.1 パッケージ構成

monorepo（npm workspaces）で 3 パッケージに分割する。

#### パッケージ間の依存方向

```
mcp-server  ──→  core  ──→  data
```

依存は **常に右方向（上位層から下位層）** のみ許可する。逆方向の依存は禁止する。

#### 各パッケージの責務

| パッケージ | npm パッケージ名 | 責務 | 依存先 |
|---|---|---|---|
| `packages/data` | `@ai-rotom/data` | 種族値・技・特性・タイプ相性などの静的データを JSON/TS で提供する | なし |
| `packages/core` | `@ai-rotom/core` | ダメージ計算・選出アドバイス・パーティ構築支援のビジネスロジック | `@ai-rotom/data` |
| `packages/mcp-server` | `@ai-rotom/mcp-server` | MCP プロトコルの実装。core のユースケースを MCP ツールとして公開する | `@ai-rotom/core` |

### 2.2 設計方針

DDD ライクな設計を採用する。ドメインモデルを ValueObject / Entity として厳密に型定義し、ビジネスロジックをドメイン層に集約する。

#### 設計原則

| 原則 | 適用内容 |
|---|---|
| 依存性逆転の原則 | core パッケージ内でドメイン層が他のレイヤーに依存しない |
| 単一責任の原則 | 各パッケージ・各レイヤーが明確に1つの責務を持つ |
| YAGNI | 現時点で不要な抽象化は行わない。ただし Repository の interface/impl 分離はテスタビリティのために導入する |

### 2.3 core パッケージのレイヤー構成

core パッケージ内部を 3 レイヤーに分割する。

```
┌─────────────────────────────────────┐
│         Application 層              │  ← ユースケース（各機能のオーケストレーション）
├─────────────────────────────────────┤
│           Domain 層                 │  ← ビジネスルール（Entity, ValueObject, DomainService）
├─────────────────────────────────────┤
│        Infrastructure 層            │  ← data パッケージへのアクセス（Repository 実装）
└─────────────────────────────────────┘
```

#### 依存方向

```
Application  ──→  Domain  ←──  Infrastructure
```

- Application 層は Domain 層に依存する
- Infrastructure 層は Domain 層に依存する（Domain 層で定義した Repository interface を実装する）
- **Domain 層はどのレイヤーにも依存しない**

#### 各レイヤーの責務

| レイヤー | 責務 | 配置するもの |
|---|---|---|
| Domain | ビジネスルールの表現 | Entity, ValueObject, DomainService, Repository interface, ドメインの型定義 |
| Application | ユースケースの実行 | UseCase（ダメージ計算・選出アドバイス・パーティ構築支援）、DTO |
| Infrastructure | 外部データへのアクセス | Repository 実装（`@ai-rotom/data` からのデータ取得・変換） |

### 2.4 ディレクトリ構成

```
packages/
├── data/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts                    # 公開 API
│   │   ├── pokemon/                    # ポケモンデータ
│   │   │   ├── pokemon.json
│   │   │   └── index.ts
│   │   ├── moves/                      # 技データ
│   │   │   ├── moves.json
│   │   │   └── index.ts
│   │   ├── abilities/                  # 特性データ
│   │   │   ├── abilities.json
│   │   │   └── index.ts
│   │   └── types/                      # タイプ相性データ
│   │       ├── type-matchups.json
│   │       └── index.ts
│   └── tsconfig.json
│
├── core/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts                    # 公開 API
│   │   ├── domain/                     # Domain 層
│   │   │   ├── model/
│   │   │   │   ├── pokemon/            # ポケモン関連の Entity / VO
│   │   │   │   ├── move/              # 技関連の Entity / VO
│   │   │   │   ├── battle/            # バトル関連の Entity / VO
│   │   │   │   └── party/             # パーティ関連の Entity / VO
│   │   │   ├── service/               # DomainService
│   │   │   │   ├── damage-calculator.ts
│   │   │   │   └── type-matchup-evaluator.ts
│   │   │   └── repository/            # Repository interface
│   │   │       ├── pokemon-repository.ts
│   │   │       ├── move-repository.ts
│   │   │       └── ability-repository.ts
│   │   ├── application/                # Application 層
│   │   │   ├── use-case/
│   │   │   │   ├── calculate-damage.ts
│   │   │   │   ├── suggest-selection.ts
│   │   │   │   └── assist-party-building.ts
│   │   │   └── dto/
│   │   └── infrastructure/             # Infrastructure 層
│   │       └── repository/
│   │           ├── pokemon-repository-impl.ts
│   │           ├── move-repository-impl.ts
│   │           └── ability-repository-impl.ts
│   └── tsconfig.json
│
└── mcp-server/
    ├── package.json
    ├── src/
    │   ├── index.ts                    # エントリーポイント
    │   ├── server.ts                   # MCP サーバーの初期化・起動
    │   └── tools/                      # MCP ツール定義
    │       ├── damage-calculation.ts
    │       ├── selection-advice.ts
    │       └── party-building.ts
    └── tsconfig.json
```

### 2.5 パッケージ間のデータの流れ

MCP ツール呼び出し時のデータの流れを以下に示す。

```
LLM (Claude 等)
  │  MCP プロトコル
  ▼
mcp-server  ─── ツール定義・入力バリデーション・レスポンス整形
  │  UseCase 呼び出し
  ▼
core/application  ─── ユースケースの実行・オーケストレーション
  │  Domain モデル操作
  ▼
core/domain  ─── ビジネスロジックの実行（ダメージ計算等）
  ▲
  │  Repository interface
core/infrastructure  ─── データ取得・ドメインモデルへの変換
  │
  ▼
data  ─── 静的データの提供
```

### 2.6 拡張ポイント

将来的に API / Web UI を追加する場合、core パッケージはそのまま再利用できる。

```
mcp-server  ──→  core  ──→  data
api-server  ──→  core  ──→  data     （将来追加）
web-ui      ──→  core  ──→  data     （将来追加）
```

新しいパッケージは core の Application 層（UseCase）を呼び出すだけでよく、ドメインロジックの再実装は不要である。

## 3. ドメインモデル設計

_（後続で記載予定）_

## 4. データ設計

_（後続で記載予定）_

## 5. 機能仕様

### 5.1 ダメージ計算

_（後続で記載予定）_

### 5.2 選出アドバイス

_（後続で記載予定）_

### 5.3 パーティ構築支援

_（後続で記載予定）_

## 6. MCP サーバー インターフェース設計

_（後続で記載予定）_

## 7. テスト戦略

_（後続で記載予定）_

## 8. 拡張計画

_（後続で記載予定）_
