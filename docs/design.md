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
| 努力値 | 0〜252（合計 510） | 「能力ポイント」に変更（各ステータス 0〜32、合計 0〜66。実数値に直接加算ではなく計算式内で ×2 される） |
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
| ダメージ計算エンジン | `@smogon/calc`（MIT ライセンス） |
| リポジトリ構成 | monorepo（packages/shared + packages/mcp-server） |
| パッケージ管理 | npm workspaces |
| データソース | `@smogon/calc` に内蔵。日本語↔英語名マッピングのみ自前で管理 |
| 動作環境 | ローカル完結 |
| 配布方法 | `npx ai-rotom` で MCP サーバーを起動 |
| 拡張性 | 将来的に API サーバー / Web UI の追加を想定した構造にする |

```
ai-rotom/
├── packages/
│   ├── shared/         # 共通型定義・分析ロジック
│   └── mcp-server/     # MCP サーバー実装 + @smogon/calc ラッパー + 名前変換データ
├── docs/
│   └── design.md       # 本ドキュメント
└── package.json        # workspaces ルート
```

---

## 2. アーキテクチャ設計

### 2.1 パッケージ構成

monorepo（npm workspaces）で 2 パッケージに分割する（MVP 構成）。

#### パッケージ間の依存方向

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

依存は **常に shared 方向** のみ許可する。逆方向の依存は禁止する。

#### 各パッケージの責務

| パッケージ | npm パッケージ名 | 責務 | npm publish | 依存先 |
|---|---|---|---|---|
| `packages/shared` | `@ai-rotom/shared` | 共通型定義（DTO）・選出分析ロジック・パーティ弱点分析ロジック・名前変換ユーティリティ | しない（内部用） | なし |
| `packages/mcp-server` | `ai-rotom` | MCP サーバー実装 + `@smogon/calc` のラッパー + 名前変換マッピングデータ | する（`npx ai-rotom`） | `@ai-rotom/shared`, `@smogon/calc` |
| `packages/api-server`（将来追加） | - | REST API サーバー | しない（サーバーデプロイ） | `@ai-rotom/shared` |

### 2.2 設計方針

ダメージ計算は `@smogon/calc` に委譲し、MCP サーバーとしての価値（AI 連携・選出アドバイス・構築支援）に集中する。

#### 設計原則

| 原則 | 適用内容 |
|---|---|
| 単一責任の原則 | 各パッケージ・各レイヤーが明確に1つの責務を持つ |
| YAGNI | 現時点で不要な抽象化は行わない |
| ライブラリ活用 | ダメージ計算・ステータス計算・タイプ相性評価は `@smogon/calc` に委譲し、自前実装しない |

### 2.3 パッケージの役割分担

```
┌─────────────────────────────────────────────────┐
│  shared パッケージ                                │
│  ┌─────────────────────────────────────┐         │
│  │  共通型定義（DTO）                    │  ← MCP 入出力の型、分析結果の型
│  ├─────────────────────────────────────┤         │
│  │  分析ロジック                         │  ← 選出分析・パーティ弱点分析・素早さ比較
│  ├─────────────────────────────────────┤         │
│  │  ユーティリティ                       │  ← 名前変換（日本語↔英語）
│  └─────────────────────────────────────┘         │
└─────────────────────────────────────────────────┘
                       ▲
┌─────────────────────────────────────────────────┐
│  mcp-server パッケージ                            │
│  ┌─────────────────────────────────────┐         │
│  │  MCP ツール定義                      │  ← 入力バリデーション・レスポンス整形
│  ├─────────────────────────────────────┤         │
│  │  @smogon/calc ラッパー               │  ← ダメージ計算の呼び出し・結果変換
│  ├─────────────────────────────────────┤         │
│  │  名前変換マッピングデータ             │  ← JSON（日本語名↔英語名）
│  └─────────────────────────────────────┘         │
└─────────────────────────────────────────────────┘
```

#### 依存方向

```
mcp-server ──→ shared
mcp-server ──→ @smogon/calc
```

- mcp-server は shared の型定義・分析ロジックと `@smogon/calc` のダメージ計算に依存する
- shared は外部ライブラリに依存しない

### 2.4 ディレクトリ構成

```
packages/
├── shared/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── types/                      # 共通型定義（DTO）
│   │   │   ├── damage.ts               # DamageResultDto 等
│   │   │   ├── selection.ts            # SelectionAnalysis 等
│   │   │   ├── party.ts                # PartyWeaknessAnalysis 等
│   │   │   └── pokemon-input.ts        # PokemonInput 等（MCP入力型）
│   │   ├── analysis/                   # 分析ロジック
│   │   │   ├── selection-analyzer.ts   # 選出分析（ダメ計結果+タイプ相性+素早さを統合）
│   │   │   ├── party-analyzer.ts       # パーティ弱点分析
│   │   │   └── speed-comparator.ts     # 素早さ比較
│   │   └── utils/                      # ユーティリティ
│   │       └── name-resolver.ts        # 日本語名 ↔ 英語名の変換
│   └── tsconfig.json
│
└── mcp-server/
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── server.ts
    │   ├── tools/                      # MCP ツール定義
    │   │   ├── damage-calculation.ts
    │   │   ├── selection-advice.ts
    │   │   └── party-building.ts
    │   └── calc/                       # @smogon/calc のラッパー
    │       └── damage-calculator.ts    # @smogon/calc を呼び出すアダプター
    ├── data/                           # 名前変換マッピングデータ
    │   ├── pokemon-names.json          # 日本語名 ↔ 英語名
    │   ├── move-names.json
    │   ├── ability-names.json
    │   ├── item-names.json
    │   └── nature-names.json
    └── tsconfig.json
```

### 2.5 パッケージ間のデータの流れ

MCP ツール呼び出し時のデータの流れを以下に示す。

```
LLM (Claude 等)
  │  MCP プロトコル
  ▼
mcp-server/tools  ─── ツール定義・入力バリデーション
  │
  ├─ ダメージ計算 → mcp-server/calc → @smogon/calc
  ├─ 選出分析   → shared/analysis/selection-analyzer
  └─ 構築分析   → shared/analysis/party-analyzer
  │
  ▼
レスポンス整形 → LLM に返却
```

### 2.6 拡張ポイント

将来的に API サーバー / Web UI を追加する場合、shared パッケージの型定義・分析ロジックはそのまま再利用できる。

**MVP 構成:**

```
mcp-server ──depends──→ shared
mcp-server ──depends──→ @smogon/calc
```

**将来構成（API サーバー追加時）:**

```
mcp-server  ──HTTP──→  api-server  ──→  DB
     │                      │
     └──depends──→  shared  ←──depends──┘

web-ui  ──HTTP──→  api-server                 （将来追加）
```

新しいサーバーパッケージは shared の型定義・分析ロジックを再利用する。

## 3. モデル設計

### 3.1 基本思想

**「プログラムは正確なデータを出す。AI はデータを元に考える。」**

ai-rotom の設計において、プログラム（MCP ツール）と AI（LLM）の責務を明確に分離する。プログラムは計算やデータの提供に徹し、解釈・判断・提案は AI に委ねる。`@smogon/calc` が「正確なデータを出す」部分を担い、ai-rotom はそのデータを AI が活用しやすい形に整形・統合する。

| 機能 | プログラム（ツール）の責務 | AI の責務 |
|---|---|---|
| ダメージ計算 | `@smogon/calc` による正確な数値計算（3粒度：1対1の1技、1対1の全技、パーティ対パーティ） | 結果の解釈・説明 |
| 選出アドバイス | タイプ相性・ダメ計・素早さ等のデータ提供 | データを総合して選出を判断・提案 |
| パーティ構築 | パーティの弱点分析（タイプ相性の穴の洗い出し） | 弱点を踏まえた構築案の提案 |

この分離により、プログラムは「正確さ」に集中し、AI は「思考の質」に集中できる。

### 3.2 @smogon/calc に委譲する機能

以下の機能はすべて `@smogon/calc` に委譲し、自前実装しない。

| 機能 | 旧（自前実装） | 新（@smogon/calc に委譲） |
|---|---|---|
| ダメージ計算 | DamageCalculator（DomainService） | `calculate()` 関数 |
| ステータス計算 | StatCalculator（DomainService） | `Pokemon` クラスのコンストラクタ |
| タイプ相性評価 | TypeMatchupEvaluator（DomainService） | `calculate()` の内部処理 |
| ポケモン・技・特性・持ち物のデータ | 自前 JSON + Repository パターン | `@smogon/calc` に内蔵 |

#### @smogon/calc の利用方法

```typescript
import { calculate, Generations, Pokemon, Move, Field } from '@smogon/calc';

const gen = Generations.get(0); // 0 = Champions

const result = calculate(
  gen,
  new Pokemon(gen, 'Charizard', { nature: 'Modest', evs: { spa: 32 } }),
  new Pokemon(gen, 'Gyarados'),
  new Move(gen, 'Flamethrower'),
  new Field({ weather: 'Sun' })
);
// result.fullDesc() → "32+ SpA Charizard Flamethrower vs. 0 HP / 0 SpD Gyarados: 38-45 (22.3 - 26.4%)"
// result.range() → [38, 45]
```

- チャンピオンズは Generation 0 として扱われる
- evs パラメータに能力ポイント（0〜32）をそのまま渡せる
- 現在は npm 未 publish のため、GitHub master からビルドしてインストール
- npm に publish され次第、通常の依存に切り替える

### 3.3 自前実装する機能

以下の機能は `@smogon/calc` に含まれないため、自前で実装する。

| 機能 | 配置先 | 概要 |
|---|---|---|
| SelectionAnalyzer | `shared/analysis/` | 選出分析（ダメ計結果 + タイプ相性 + 素早さを統合） |
| PartyAnalyzer | `shared/analysis/` | パーティ弱点分析（タイプ相性の穴の洗い出し） |
| SpeedComparator | `shared/analysis/` | 素早さ比較（実数値に基づく行動順の判定） |
| NameResolver | `shared/utils/` | 日本語名 ↔ 英語名の変換 |
| DamageCalculatorAdapter | `mcp-server/calc/` | `@smogon/calc` のラッパー（結果を DTO に変換） |

#### SpeedComparator

素早さの比較を行い、行動順を判定する。`@smogon/calc` には素早さ比較の機能が含まれないため、自前で実装する。

| メソッド | 入力 | 出力 | 説明 |
|---|---|---|---|
| compare | PokemonInput, PokemonInput | CompareResult | 2体の素早さを比較 |
| sortBySpeed | PokemonInput[] | PokemonInput[] | 素早さ順にソート |

- 素早さが同値の場合はランダム（結果に「同速」として明示する）
- 先制技・後攻技の優先度は考慮する
- トリックルーム等の状態異常による順序反転は将来対応とする

### 3.4 MCP 入力用の型定義

ポケモンのデータモデル（BattlePokemon, Party 等）は `@smogon/calc` の `Pokemon` クラスを利用するため、自前で定義するのは MCP 入力用の型（PokemonInput）のみとする。PokemonInput は AI が会話から組み立てるための軽量な型であり、mcp-server 側で `@smogon/calc` の `Pokemon` インスタンスに変換する。

詳細はセクション 6.3 を参照。

### 3.5 DTO 一覧

MCP ツールの出力に使う DTO は shared パッケージの `types/` に配置する。

| DTO | 配置先 | 概要 |
|---|---|---|
| DamageResultDto | `types/damage.ts` | ダメージ計算結果 |
| AllMovesResultDto | `types/damage.ts` | 1対1の全技ダメージ計算結果 |
| PartyMatchupResultDto | `types/damage.ts` | パーティ対パーティのダメージ計算結果 |
| SelectionAnalysis | `types/selection.ts` | 選出分析結果 |
| PartyWeaknessAnalysis | `types/party.ts` | パーティ弱点分析結果 |
| PokemonInput | `types/pokemon-input.ts` | MCP ツール入力用のポケモン型 |

### 3.6 テラスタル対応の拡張設計

テラスタルは現時点で未実装だが、将来追加予定である。`@smogon/calc` がテラスタルに対応した場合、自動的に利用可能になる可能性がある。

| 拡張箇所 | 対応方針 |
|---|---|
| PokemonInput | テラスタイプのフィールドを追加 |
| DamageCalculatorAdapter | `@smogon/calc` のテラスタル対応パラメータを渡す |

現時点ではこれらのフィールド・ロジックは実装しない。YAGNI 原則に従い、拡張箇所の認識のみ記録に留める。

## 4. データ設計

### 4.1 データ方針

ポケモン・技・特性・持ち物・タイプ相性のデータはすべて `@smogon/calc` に内蔵されている。自前で管理するデータは「日本語名 ↔ 英語名」の変換マッピングのみである。

| データ種別 | 管理元 | 用途 |
|---|---|---|
| ポケモン種族データ | `@smogon/calc` 内蔵 | ダメージ計算・ステータス計算 |
| 技データ | `@smogon/calc` 内蔵 | ダメージ計算 |
| 特性データ | `@smogon/calc` 内蔵 | ダメージ計算時の補正 |
| 持ち物データ | `@smogon/calc` 内蔵 | ダメージ計算時の補正 |
| タイプ相性 | `@smogon/calc` 内蔵 | ダメージ計算時の倍率 |
| 日本語名↔英語名マッピング | 自前管理（JSON） | AI の日本語入力を `@smogon/calc` の英語名に変換 |

### 4.2 名前変換マッピング

AI は日本語でポケモン名・技名等を入力するが、`@smogon/calc` は英語名を受け付ける。この変換のためのマッピングデータを自前で管理する。

#### ディレクトリ構成

```
packages/mcp-server/
└── data/                               # 名前変換マッピングデータ
    ├── pokemon-names.json              # ポケモン名
    ├── move-names.json                 # 技名
    ├── ability-names.json              # 特性名
    ├── item-names.json                 # 持ち物名
    └── nature-names.json               # 性格名
```

#### JSON スキーマ

すべてのマッピングファイルは同一のスキーマで、日本語名と英語名のペアの配列とする。

```typescript
// 例: pokemon-names.json
[
  { "ja": "リザードン", "en": "Charizard" },
  { "ja": "メガリザードンX", "en": "Charizard-Mega-X" },
  { "ja": "メガリザードンY", "en": "Charizard-Mega-Y" },
  { "ja": "ギャラドス", "en": "Gyarados" },
  ...
]

// 例: move-names.json
[
  { "ja": "かえんほうしゃ", "en": "Flamethrower" },
  { "ja": "ハイドロポンプ", "en": "Hydro Pump" },
  ...
]

// 例: nature-names.json
[
  { "ja": "いじっぱり", "en": "Adamant" },
  { "ja": "ひかえめ", "en": "Modest" },
  { "ja": "まじめ", "en": "Serious" },
  ...
]
```

### 4.3 データのバージョニング

#### 方針

名前変換マッピングデータは mcp-server パッケージ（npm パッケージ名: `ai-rotom`）に同梱して npm publish する。ゲームアップデートで新ポケモンや新技が追加された場合、マッピングを更新してバージョンを上げる。

#### バリデーション

名前マッピングの整合性チェックとして、以下を検証する。

| 検証項目 | 内容 |
|---|---|
| 重複チェック | 同一の日本語名が複数エントリに存在しないか |
| 重複チェック | 同一の英語名が複数エントリに存在しないか |
| 英語名の妥当性 | `@smogon/calc` で認識される名前であるか |

#### データ範囲

チャンピオンズに登場するポケモン・技・特性・持ち物・性格を対象とする。

## 5. 機能仕様

### 5.1 ダメージ計算

#### 5.1.1 機能概要

攻撃側ポケモンが防御側ポケモンに対して与えるダメージを正確に計算する。3つの粒度を提供し、ユーザーの状況に応じた使い分けを可能にする。

| 粒度 | 用途 | 説明 |
|---|---|---|
| Single（1対1の1技） | 特定の技のダメージを知りたい | 攻撃側の1技に対するダメージ計算 |
| AllMoves（1対1の全技） | 対面での最適な技を比較したい | 攻撃側の全技に対するダメージを一括計算 |
| PartyMatchup（パーティ対パーティ） | 試合全体の火力関係を把握したい | 両パーティの全組み合わせを一括計算 |

#### 5.1.2 入力

##### Single（1対1の1技）

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| attacker | PokemonInput | Yes | 攻撃側ポケモン |
| defender | PokemonInput | Yes | 防御側ポケモン |
| moveName | string | Yes | 使用する技名（日本語） |
| conditions | BattleConditionsInput | No | バトル環境条件（天候・フィールド） |

##### AllMoves（1対1の全技）

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| attacker | PokemonInput | Yes | 攻撃側ポケモン |
| defender | PokemonInput | Yes | 防御側ポケモン |
| conditions | BattleConditionsInput | No | バトル環境条件（天候・フィールド） |

##### PartyMatchup（パーティ対パーティ）

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| attackerParty | PartyInput | Yes | 攻撃側パーティ |
| defenderParty | PartyInput | Yes | 防御側パーティ |
| conditions | BattleConditionsInput | No | バトル環境条件（天候・フィールド） |

##### BattleConditionsInput

バトル環境条件の入力型。

| 属性 | 型 | デフォルト | 説明 |
|---|---|---|---|
| weather | Weather \| null | null | 天候（晴れ / 雨 / 砂嵐 / 雪） |
| terrain | Terrain \| null | null | フィールド（エレキ / グラス / サイコ / ミスト） |

```typescript
type Weather = "sunny" | "rainy" | "sandstorm" | "snowy";
type Terrain = "electric" | "grassy" | "psychic" | "misty";
```

天候・フィールド補正の倍率:

| 条件 | 対象 | 倍率 |
|---|---|---|
| 晴れ（sunny） | ほのお技の威力 | 1.5倍 |
| 晴れ（sunny） | みず技の威力 | 0.5倍 |
| 雨（rainy） | みず技の威力 | 1.5倍 |
| 雨（rainy） | ほのお技の威力 | 0.5倍 |
| エレキフィールド（electric） | 接地しているポケモンのでんき技の威力 | 1.3倍 |
| グラスフィールド（grassy） | 接地しているポケモンのくさ技の威力 | 1.3倍 |
| サイコフィールド（psychic） | 接地しているポケモンのエスパー技の威力 | 1.3倍 |
| ミストフィールド（misty） | 接地しているポケモンが受けるドラゴン技のダメージ | 0.5倍 |

#### 5.1.3 出力

##### Single の出力: DamageResultDto

MCP ツール用の DTO。`@smogon/calc` の計算結果を変換し、MCP 出力に必要なフィールド（日本語名、タイプ相性情報、適用された補正等）を含む。

| 属性 | 型 | 説明 |
|---|---|---|
| moveName | string | 使用した技名 |
| moveType | Type | 技のタイプ |
| attackerName | string | 攻撃側ポケモン名 |
| defenderName | string | 防御側ポケモン名 |
| minDamage | number | 最小ダメージ（乱数最低: 0.85） |
| maxDamage | number | 最大ダメージ（乱数最高: 1.00） |
| minPercentage | number | 最小ダメージの HP 割合（%） |
| maxPercentage | number | 最大ダメージの HP 割合（%） |
| guaranteedKnockouts | number | 確定数（確定1発 = 1、確定2発 = 2、...） |
| typeEffectiveness | number | タイプ相性倍率 |
| isStab | boolean | タイプ一致かどうか |
| appliedConditions | string[] | 適用された補正の説明リスト |

**出力例: リザードン（ひかえめ）のかえんほうしゃ → ギャラドス**

```json
{
  "moveName": "かえんほうしゃ",
  "moveType": "ほのお",
  "attackerName": "リザードン",
  "defenderName": "ギャラドス",
  "minDamage": 55,
  "maxDamage": 65,
  "minPercentage": 32.7,
  "maxPercentage": 38.6,
  "guaranteedKnockouts": 3,
  "typeEffectiveness": 0.5,
  "isStab": true,
  "appliedConditions": ["タイプ一致（1.5倍）", "タイプ相性: いまひとつ（0.5倍）"]
}
```

##### AllMoves の出力: AllMovesResultDto

MCP ツール用の DTO。

| 属性 | 型 | 説明 |
|---|---|---|
| attackerName | string | 攻撃側ポケモン名 |
| defenderName | string | 防御側ポケモン名 |
| results | DamageResultDto[] | 各技のダメージ計算結果（変化技を除く） |

##### PartyMatchup の出力: PartyMatchupResultDto

MCP ツール用の DTO。

| 属性 | 型 | 説明 |
|---|---|---|
| attackerPartyMembers | string[] | 攻撃側パーティメンバー名リスト |
| defenderPartyMembers | string[] | 防御側パーティメンバー名リスト |
| matchups | AllMovesResultDto[][] | 2次元配列。matchups[i][j] は攻撃側 i 番目 → 防御側 j 番目 |

#### 5.1.4 処理フロー

```
入力（PokemonInput, moveName, BattleConditionsInput）
  │
  ▼
① 日本語名 → 英語名の変換
  │  - NameResolver でポケモン名・技名・特性名・持ち物名・性格名を英語名に変換
  │
  ▼
② @smogon/calc のオブジェクトを構築
  │  - Generations.get(0) でチャンピオンズの世代を取得
  │  - Pokemon, Move, Field インスタンスを生成
  │
  ▼
③ @smogon/calc の calculate() を呼び出し
  │  - タイプ一致・タイプ相性・天候・フィールド・持ち物・特性の補正は
  │    すべて @smogon/calc が内部で処理する
  │
  ▼
④ 結果を DamageResultDto に変換
  │  - result.range() からダメージ範囲を取得
  │  - HP 割合・確定数を算出
  │  - 日本語の技名・ポケモン名を付与
  │
  ▼
⑤ DamageResultDto を返却
```

**AllMoves の処理フロー:**
- 攻撃側の技構成から変化技を除外する
- 残った攻撃技それぞれに対して Single の処理フローを実行する
- 結果を配列として返す

**PartyMatchup の処理フロー:**
- 攻撃側パーティの全メンバーと防御側パーティの全メンバーの全組み合わせに対して AllMoves を実行する
- 結果を 2 次元配列（attackerIndex × defenderIndex）として返す

#### 5.1.5 AI との連携

AI はダメージ計算ツールの出力を以下の用途に活用する。

| AI の活用方法 | 具体例 |
|---|---|---|
| ダメージの解釈 | 「リザードンのかえんほうしゃはギャラドスに対して 32.7%〜38.6% で、確定3発です。タイプ相性がいまひとつのため火力が出ません」 |
| 最適技の提案 | AllMoves の結果を比較し「ソーラービームであれば 70.2%〜82.6% で確定2発に届きます」と提案 |
| 対面判断 | 「この対面では相手を倒すのに3発かかりますが、相手のたきのぼりは確定2発なので対面不利です」 |
| 天候の影響説明 | 「晴れ下であればかえんほうしゃの威力が 1.5 倍になり、49.0%〜57.9% で確定2発圏内に入ります」 |
| パーティ全体の火力関係の俯瞰 | PartyMatchup の結果から「相手パーティに対して一貫して高打点を出せるのはこのポケモンです」と分析 |

AI はダメージの数値計算を自ら行わず、ツールから返された正確な数値を前提に解釈・説明・提案を行う。

---

### 5.2 選出アドバイス

#### 5.2.1 機能概要

自パーティと相手パーティの情報を受け取り、選出判断に必要なデータを一括で提供する。プログラムはスコアリングや順位付けを行わず、タイプ相性・ダメージ計算結果・素早さ比較の生データを構造化して返す。AI がこれらのデータを総合的に解釈し、選出の提案を行う。

#### 5.2.2 入力

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| myParty | PartyInput | Yes | 自分のパーティ |
| opponentParty | PartyInput | Yes | 相手のパーティ |
| battleFormat | BattleFormat | Yes | バトル形式（シングル / ダブル） |
| conditions | BattleConditionsInput | No | バトル環境条件（天候・フィールド） |

```typescript
type BattleFormat = "singles" | "doubles";
```

#### 5.2.3 出力: SelectionAnalysis

| 属性 | 型 | 説明 |
|---|---|---|
| typeMatchupSummary | TypeMatchupSummary | タイプ相性の要約 |
| damageAnalysis | PartyMatchupResultDto | 双方向のダメージ計算結果 |
| speedComparison | SpeedComparisonResult | 素早さ比較結果 |

##### TypeMatchupSummary

| 属性 | 型 | 説明 |
|---|---|---|
| myPartyAnalysis | PartyTypeAnalysis[] | 自パーティ各メンバーの相性分析 |
| opponentPartyAnalysis | PartyTypeAnalysis[] | 相手パーティ各メンバーの相性分析 |

##### PartyTypeAnalysis

| 属性 | 型 | 説明 |
|---|---|---|
| pokemonName | string | ポケモン名 |
| types | Type[] | タイプ |
| weaknesses | TypeEffectiveness[] | 弱点一覧（2倍・4倍を区別） |
| resistances | TypeEffectiveness[] | 耐性一覧（0.5倍・0.25倍を区別） |
| immunities | Type[] | 無効タイプ一覧 |
| offensiveMatchups | OffensiveMatchup[] | 相手パーティ各メンバーに対する攻撃面の相性 |

```typescript
interface TypeEffectiveness {
  type: Type;
  multiplier: number;
}

interface OffensiveMatchup {
  targetName: string;
  targetTypes: Type[];
  bestEffectiveness: number;
  bestType: Type;
}
```

##### SpeedComparisonResult

| 属性 | 型 | 説明 |
|---|---|---|
| myPartySpeedTiers | SpeedTier[] | 自パーティの素早さ一覧（実数値降順） |
| opponentPartySpeedTiers | SpeedTier[] | 相手パーティの素早さ一覧（実数値降順） |
| headToHead | SpeedComparison[] | 全組み合わせの素早さ比較 |

```typescript
interface SpeedTier {
  pokemonName: string;
  speedStat: number;
}

interface SpeedComparison {
  myPokemonName: string;
  opponentPokemonName: string;
  mySpeed: number;
  opponentSpeed: number;
  isFaster: boolean | null;  // 同速は null
}
```

#### 5.2.4 処理フロー

```
入力（myParty, opponentParty, battleFormat, conditions）
  │
  ├──────────────────┬──────────────────┐
  │                  │                  │
  ▼                  ▼                  ▼
① タイプ相性分析  ② ダメージ計算     ③ 素早さ比較
  │                  │                  │
  │ @smogon/calc     │ @smogon/calc     │ SpeedComparator
  │ のデータを利用    │ の calculate()   │ を使用
  │                  │ を使用           │
  │                  │                  │
  ▼                  ▼                  ▼
TypeMatchup       PartyMatchup      SpeedComparison
Summary           Result            Result
  │                  │                  │
  └──────────────────┴──────────────────┘
                     │
                     ▼
             SelectionAnalysis として統合・返却
```

#### 5.2.5 AI との連携

| AI の活用方法 | 具体例 |
|---|---|---|
| 選出の提案 | 「相手のパーティにみず・じめんタイプが多いため、くさ技で一貫性のあるポケモンの選出を推奨します」 |
| 対面の有利不利の判断 | ダメージ計算結果と素早さ比較を組み合わせて「先制でき、かつ確定2発で倒せるため有利です」と判断 |
| 裏の考慮 | タイプ相性と素早さから「初手で不利な対面になった場合に引き先として機能するポケモン」を提案 |
| 相手の型の推測と助言 | AI 自身の知識で「このポケモンはスカーフ型が多いため、素早さで上を取られる可能性があります」と補足 |
| ダブルバトルの並び提案 | battleFormat が `"doubles"` の場合、横の相性も考慮した並びを提案 |

プログラムは「よくある型（テンプレート）」のデータを持たない。型情報や環境メタゲームに関する知識は AI 側が持つ。AI はツールが提供する客観的データと自身のゲーム知識を組み合わせて選出提案を行う。

---

### 5.3 パーティ構築支援

#### 5.3.1 機能概要

ユーザーのパーティ構成を受け取り、タイプ相性の観点からパーティの弱点を分析する。プログラムは弱点の洗い出しのみを行い、具体的な構築案の提案は AI に委ねる。

#### 5.3.2 入力

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| party | PartyInput | Yes | 分析対象のパーティ（1〜6体） |

#### 5.3.3 出力: PartyWeaknessAnalysis

| 属性 | 型 | 説明 |
|---|---|---|
| memberAnalysis | MemberTypeProfile[] | 各メンバーのタイプ相性プロファイル |
| partyWeaknessSummary | PartyWeaknessSummary | パーティ全体の弱点要約 |
| offensiveCoverage | OffensiveCoverage | パーティ全体の攻撃範囲分析 |

##### MemberTypeProfile

| 属性 | 型 | 説明 |
|---|---|---|
| pokemonName | string | ポケモン名 |
| types | Type[] | タイプ |
| weaknesses | TypeEffectiveness[] | 弱点一覧（倍率つき） |
| resistances | TypeEffectiveness[] | 耐性一覧（倍率つき） |
| immunities | Type[] | 無効タイプ一覧 |
| moveTypes | Type[] | 所持する攻撃技のタイプ一覧 |

##### PartyWeaknessSummary

| 属性 | 型 | 説明 |
|---|---|---|
| weaknessCount | TypeCount[] | 各タイプに弱点を持つメンバー数 |
| resistanceCount | TypeCount[] | 各タイプに耐性を持つメンバー数 |
| immunityCount | TypeCount[] | 各タイプを無効にできるメンバー数 |
| unresisted | Type[] | パーティ内に半減以下で受けられるメンバーがいないタイプ |
| criticalWeaknesses | CriticalWeakness[] | 3体以上が弱点を突かれるタイプ（パーティの致命的な穴） |

```typescript
interface TypeCount {
  type: Type;
  count: number;
  members: string[];
}

interface CriticalWeakness {
  type: Type;
  weakMembers: string[];
  resistMembers: string[];
}
```

##### OffensiveCoverage

| 属性 | 型 | 説明 |
|---|---|---|
| coveredTypes | CoverageEntry[] | 各タイプに対する打点の有無 |
| uncoveredTypes | Type[] | パーティ全体で抜群を取れないタイプ |

```typescript
interface CoverageEntry {
  targetType: Type;
  superEffectiveMembers: string[];
}
```

**出力例（一部抜粋）: リザードン + ギャラドス + ガブリアス のパーティ**

```json
{
  "partyWeaknessSummary": {
    "criticalWeaknesses": [
      {
        "type": "いわ",
        "weakMembers": ["リザードン", "ギャラドス"],
        "resistMembers": ["ガブリアス"]
      }
    ],
    "unresisted": ["フェアリー"]
  },
  "offensiveCoverage": {
    "uncoveredTypes": ["フェアリー"]
  }
}
```

#### 5.3.4 処理フロー

```
入力（PartyInput）
  │
  ▼
① 各メンバーのタイプ相性プロファイルを作成
  │  - @smogon/calc のデータを利用して弱点・耐性・無効を算出
  │  - 所持する攻撃技のタイプを抽出
  │
  ▼
② パーティ全体の弱点を集計
  │  - 全18タイプについて、弱点を持つメンバー数を集計
  │  - 全18タイプについて、耐性を持つメンバー数を集計
  │  - 3体以上が弱点を突かれるタイプを criticalWeaknesses として抽出
  │  - 半減以下で受けられるメンバーがいないタイプを unresisted として抽出
  │
  ▼
③ 攻撃範囲を分析
  │  - 各メンバーの攻撃技タイプから、全18タイプへの抜群の有無を判定
  │  - パーティ全体で抜群を取れないタイプを uncoveredTypes として抽出
  │
  ▼
④ PartyWeaknessAnalysis を構築して返却
```

#### 5.3.5 AI との連携

| AI の活用方法 | 具体例 |
|---|---|---|
| 弱点の指摘 | 「パーティ全体でいわタイプが重い（3体が弱点を突かれる）ため、いわ技への耐性がある枠が必要です」 |
| 穴埋めの提案 | unresisted と uncoveredTypes を踏まえ「フェアリーに対して半減で受けられて、かつ抜群を取れるはがねタイプのポケモンを推奨します」 |
| 構築コンセプトに沿った助言 | ユーザーとの会話で把握した構築の方向性に合わせて「天候パーティであれば、この弱点は天候エースの火力で押し切れるため許容範囲です」と判断 |
| 段階的な構築サポート | パーティが未完成（6体未満）の場合、現状の穴を示して「残り枠で補うべき要素」を提案 |
| メガシンカの考慮 | メガシンカ前後でタイプが変わるポケモンがいる場合、両方の状態での分析を踏まえて助言 |

プログラムは環境の流行や特定の構築テンプレートに関する知識を持たない。メタゲームを踏まえた構築判断は AI が自身の知識に基づいて行う。

## 6. MCP サーバー インターフェース設計

MCP サーバーは `npx ai-rotom` で起動できる。npm パッケージ名は `ai-rotom` であり、データを同梱した状態で publish する。

### 6.1 設計方針

MCP ツールの入力は、AI（Claude 等）が会話の文脈からパラメータを組み立てやすい形で設計する。ダメージ計算には `@smogon/calc` を利用する。

| 方針 | 説明 |
|---|---|
| 名前ベースの指定 | ポケモン名・技名・特性名・性格名・持ち物名は日本語名で指定する。英語名への変換はプログラム側が行う |
| 省略可能なパラメータ | 育成データ（性格・能力ポイント・特性・技構成・持ち物）は省略可能。省略時はデフォルト値を適用する |
| フラットな入力構造 | `@smogon/calc` の内部構造を MCP ツールの入力に露出させない |
| 日本語フレンドリー | ツール名は英語（MCP 規約）だが、パラメータ値はすべて日本語で受け付ける |

#### 名前変換の流れ

```
AI（日本語入力）→ NameResolver（日本語→英語）→ @smogon/calc（英語名で処理）→ レスポンス（日本語名で返却）
```

#### デフォルト値一覧

| パラメータ | デフォルト値 | 根拠 |
|---|---|---|
| nature（性格） | `"まじめ"`（無補正） | 性格不明の場合に最もニュートラルな前提 |
| abilityPoints（能力ポイント） | 全ステータス `0` | 能力ポイント不明の場合は無振りとして計算 |
| ability（特性） | そのポケモンの特性リストの先頭 | 最も代表的な特性を仮定 |
| moves（技構成） | そのポケモンの覚える技リストから最初の4つ | AllMoves / PartyMatchup の場合は全覚え技を対象にする選択肢もある |
| item（持ち物） | `null`（持ち物なし） | 持ち物不明の場合は補正なしで計算 |

### 6.2 MCP ツール一覧

| # | ツール名 | 概要 | 対応するユースケース |
|---|---|---|---|
| 1 | `calculate_damage_single` | 1対1の1技のダメージ計算 | 5.1 ダメージ計算（Single） |
| 2 | `calculate_damage_all_moves` | 1対1の全技のダメージ計算 | 5.1 ダメージ計算（AllMoves） |
| 3 | `calculate_damage_party_matchup` | パーティ対パーティの全組み合わせダメージ計算 | 5.1 ダメージ計算（PartyMatchup） |
| 4 | `analyze_selection` | 選出判断に必要なデータの一括分析 | 5.2 選出アドバイス |
| 5 | `analyze_party_weakness` | パーティの弱点分析 | 5.3 パーティ構築支援 |

### 6.3 共通の入力型定義

#### PokemonInput

AI が会話から組み立てる「対戦用ポケモン」の入力表現。

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "ポケモン名（日本語）。例: \"リザードン\""
    },
    "nature": {
      "type": "string",
      "description": "性格名（日本語）。省略時は \"まじめ\"（無補正）。例: \"ひかえめ\""
    },
    "abilityPoints": {
      "type": "object",
      "description": "能力ポイント配分。省略時は全ステータス 0。",
      "properties": {
        "hp": { "type": "number" },
        "attack": { "type": "number" },
        "defense": { "type": "number" },
        "specialAttack": { "type": "number" },
        "specialDefense": { "type": "number" },
        "speed": { "type": "number" }
      }
    },
    "ability": {
      "type": "string",
      "description": "特性名（日本語）。省略時はそのポケモンの代表特性。例: \"もうか\""
    },
    "moves": {
      "type": "array",
      "items": { "type": "string" },
      "description": "技名の配列（日本語、最大4つ）。省略時はデフォルトの技構成。例: [\"かえんほうしゃ\", \"エアスラッシュ\"]"
    },
    "item": {
      "type": "string",
      "description": "持ち物名（日本語）。省略時は持ち物なし。例: \"いのちのたま\""
    },
    "isMegaEvolved": {
      "type": "boolean",
      "description": "メガシンカ状態かどうか。省略時は false"
    },
    "megaForm": {
      "type": "string",
      "description": "メガシンカ先の名前（日本語）。メガシンカ先が複数ある場合のみ使用。例: \"メガリザードンY\""
    }
  },
  "required": ["name"]
}
```

#### PartyInput

```json
{
  "type": "object",
  "properties": {
    "members": {
      "type": "array",
      "items": { "$ref": "#/PokemonInput" },
      "minItems": 1,
      "maxItems": 6,
      "description": "パーティメンバー（1〜6体）"
    }
  },
  "required": ["members"]
}
```

#### BattleConditionsInput

```json
{
  "type": "object",
  "properties": {
    "weather": {
      "type": "string",
      "enum": ["sunny", "rainy", "sandstorm", "snowy"],
      "description": "天候。省略時は天候なし"
    },
    "terrain": {
      "type": "string",
      "enum": ["electric", "grassy", "psychic", "misty"],
      "description": "フィールド。省略時はフィールドなし"
    }
  }
}
```

### 6.4 各ツールの入力スキーマと出力形式

#### 6.4.1 calculate_damage_single

**入力:**

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| attacker | PokemonInput | Yes | 攻撃側ポケモン |
| defender | PokemonInput | Yes | 防御側ポケモン |
| moveName | string | Yes | 使用する技名（日本語） |
| conditions | BattleConditionsInput | No | バトル環境条件 |

**出力:** セクション 5.1.3 の DamageResultDto と同一構造。

#### 6.4.2 calculate_damage_all_moves

**入力:**

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| attacker | PokemonInput | Yes | 攻撃側ポケモン |
| defender | PokemonInput | Yes | 防御側ポケモン |
| conditions | BattleConditionsInput | No | バトル環境条件 |

**出力:** セクション 5.1.3 の AllMovesResultDto と同一構造。

#### 6.4.3 calculate_damage_party_matchup

**入力:**

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| attackerParty | PartyInput | Yes | 攻撃側パーティ |
| defenderParty | PartyInput | Yes | 防御側パーティ |
| conditions | BattleConditionsInput | No | バトル環境条件 |

**出力:** セクション 5.1.3 の PartyMatchupResultDto と同一構造。

#### 6.4.4 analyze_selection

**入力:**

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| myParty | PartyInput | Yes | 自分のパーティ |
| opponentParty | PartyInput | Yes | 相手のパーティ |
| battleFormat | string | Yes | `"singles"` または `"doubles"` |
| conditions | BattleConditionsInput | No | バトル環境条件 |

**出力:** セクション 5.2.3 の SelectionAnalysis と同一構造。

#### 6.4.5 analyze_party_weakness

**入力:**

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| party | PartyInput | Yes | 分析対象のパーティ |

**出力:** セクション 5.3.3 の PartyWeaknessAnalysis と同一構造。

### 6.5 ツール間の使い分けガイド

```
ユーザーの質問
  │
  ├─ 「○○の△△で××にどれくらいダメージ入る？」
  │   → calculate_damage_single
  │
  ├─ 「○○で××に一番効く技は？」
  │   → calculate_damage_all_moves
  │
  ├─ 「このパーティで相手パーティに火力足りる？」
  │   → calculate_damage_party_matchup
  │
  ├─ 「相手のパーティに対して何を選出すればいい？」
  │   → analyze_selection
  │
  └─ 「このパーティの弱点は？」「残り枠何がいい？」
      → analyze_party_weakness
```

| シチュエーション | 推奨ツール | 理由 |
|---|---|---|
| 特定の対面で特定の技のダメージを知りたい | `calculate_damage_single` | 最も軽量。ピンポイントの疑問に即答 |
| 対面でどの技が最も有効か比較したい | `calculate_damage_all_moves` | 全技の火力を並べて比較 |
| 試合開始前にパーティ同士の火力関係を俯瞰したい | `calculate_damage_party_matchup` | 全組み合わせを一括計算 |
| 選出を決めたい | `analyze_selection` | タイプ相性・ダメージ・素早さを統合分析 |
| パーティ構築中に弱点を確認したい | `analyze_party_weakness` | タイプ相性の穴を洗い出す |

### 6.6 エラーハンドリング

| エラー種別 | 例 | レスポンス |
|---|---|---|
| ポケモン名が見つからない | `"リザードソ"`（タイポ） | 類似名を含むエラーメッセージ（「"リザードン" ですか？」） |
| 技名が見つからない | `"かえんほうしゅ"` | 同上 |
| そのポケモンが覚えない技 | リザードンに `"ハイドロポンプ"` | 覚えない旨を明示 |
| パーティメンバー数超過 | 7体以上 | 最大6体である旨を明示 |
| 変化技でのダメージ計算 | `"まもる"` | 変化技はダメージ計算の対象外である旨を明示 |

名前の変換（日本語名 → 英語名）は mcp-server 層の NameResolver で行い、名前が見つからない場合は類似名のサジェストを含むエラーメッセージを返す。

## 7. テスト戦略

### 7.1 テスト方針

| 方針 | 説明 |
|---|---|
| テストフレームワーク | Vitest |
| テストファイル配置 | ソースファイルと同階層に `*.test.ts` を配置する（コロケーション） |
| カバレッジ目標 | 分析ロジック: 100%、MCP ツール: 80% 以上 |
| テストの独立性 | 各テストケースは他のテストに依存しない |
| @smogon/calc のテスト | 不要（ライブラリ側でテスト済み） |

#### パッケージごとのテスト対象

| パッケージ | 主なテスト対象 | テストの性質 |
|---|---|---|
| `@ai-rotom/shared` | 選出分析ロジック・パーティ分析ロジック・素早さ比較・名前変換 | ユニットテスト中心 |
| `ai-rotom`（mcp-server） | MCP ツールの入力バリデーション・名前変換・`@smogon/calc` ラッパーの統合テスト | 結合テスト中心 |

### 7.2 各パッケージのテスト戦略

#### 7.2.1 shared パッケージ

**SelectionAnalyzer のテスト項目:**

| テスト対象 | テスト内容 |
|---|---|
| タイプ相性分析 | 弱点・耐性・無効の正しい算出 |
| データ統合 | ダメ計結果 + タイプ相性 + 素早さの正しい統合 |

**PartyAnalyzer のテスト項目:**

| テスト対象 | テスト内容 |
|---|---|
| 弱点集計 | パーティ全体の弱点タイプの正しい集計 |
| 致命的弱点 | 3体以上が弱点を突かれるタイプの正しい検出 |
| 攻撃範囲 | パーティ全体の攻撃範囲の正しい算出 |
| 未カバータイプ | 抜群を取れないタイプの正しい検出 |

**SpeedComparator のテスト項目:**

| テスト対象 | テスト内容 |
|---|---|
| 素早さ比較 | 速い方が正しく判定されるか |
| 同速 | 同速の場合に null（ランダム）が返されるか |
| ソート | 複数ポケモンの素早さ順ソートが正しいか |

**NameResolver のテスト項目:**

| テスト対象 | テスト内容 |
|---|---|
| 正常変換 | 日本語名から正しい英語名に変換されるか |
| 逆変換 | 英語名から正しい日本語名に変換されるか |
| 存在しない名前 | 見つからない場合にエラーが返されるか |
| 類似名サジェスト | タイポ時に類似する名前が提案されるか |

#### 7.2.2 mcp-server パッケージ

**MCP ツールのテスト:**

| テスト対象 | テスト内容 |
|---|---|
| 入力バリデーション | 不正な入力に対して適切なエラーメッセージが返されるか |
| デフォルト値適用 | 省略されたパラメータにデフォルト値が正しく適用されるか |

**@smogon/calc ラッパーの統合テスト:**

| テスト対象 | テスト内容 |
|---|---|
| 基本的なダメージ計算 | `@smogon/calc` の結果が正しく DamageResultDto に変換されるか |
| 天候・フィールド | Field パラメータが正しく渡されるか |
| 能力ポイント | evs パラメータに正しく変換されるか |
| メガシンカ | メガシンカ後のポケモン名が正しく渡されるか |

**名前変換マッピングデータのテスト:**

| テスト対象 | テスト内容 |
|---|---|
| 重複チェック | 同一の日本語名・英語名が複数存在しないか |
| 英語名の妥当性 | `@smogon/calc` で認識される名前であるか |

### 7.3 テストの優先度

| 優先度 | 対象 | 理由 |
|---|---|---|
| **P0** | `@smogon/calc` ラッパーの統合テスト（mcp-server） | ダメージ計算の正確性がプロダクトの核心価値。ラッパーが正しく呼び出し・変換していることを保証する |
| **P0** | NameResolver（shared） | 名前変換の誤りは計算結果の誤りに直結する |
| **P1** | 名前変換マッピングデータの整合性（mcp-server） | データの欠落は名前変換の失敗に直結 |
| **P1** | SelectionAnalyzer（shared） | 選出分析はプロダクトの主要機能 |
| **P1** | PartyAnalyzer（shared） | パーティ分析はプロダクトの主要機能 |
| **P2** | SpeedComparator（shared） | 素早さ比較は選出分析の構成要素 |
| **P2** | MCP ツールの入力バリデーション（mcp-server） | ユーザー体験に影響 |

### 7.4 テストデータの管理方針

| 種類 | 管理場所 | 用途 |
|---|---|---|
| フィクスチャ | `__fixtures__/` | 実在のポケモンデータに基づくテストデータ |
| ファクトリ関数 | `__helpers__/` | テスト用の PokemonInput / PartyInput を簡潔に生成 |
| インラインデータ | 各テストファイル内 | テスト固有のデータ |

ダメージ計算の検証には、ゲーム内で確認した実測値をコメントとして併記する。

## 8. 拡張計画

### 8.1 拡張ロードマップ

| # | 拡張項目 | 優先度 | 依存先 | 概要 |
|---|---|---|---|---|
| 1 | テラスタル対応 | 高 | `@smogon/calc` の対応 | ゲームアップデートで追加予定のテラスタル機能への対応 |
| 2 | API サーバー | 中 | shared パッケージ | 一般ユーザー向けの REST API サーバー |
| 3 | Web UI | 低 | API サーバー | ブラウザで利用できるフロントエンド |

```
現在（MVP）:
  mcp-server ──depends──→ shared
  mcp-server ──depends──→ @smogon/calc

拡張後（API サーバー追加時）:
  mcp-server  ──HTTP──→  api-server  ──→  DB
       │                      │
       └──depends──→  shared  ←──depends──┘

  web-ui  ──HTTP──→  api-server                 ← 拡張 #3

テラスタル対応: @smogon/calc の対応 + PokemonInput の拡張  ← 拡張 #1
```

### 8.2 テラスタル対応

#### 影響範囲

| 変更箇所 | 変更内容 |
|---|---|
| PokemonInput | `teraType` パラメータを追加 |
| DamageCalculatorAdapter | `@smogon/calc` のテラスタル対応パラメータを渡す |
| MCP ツール | PokemonInput の拡張に追従 |

`@smogon/calc` がテラスタルに対応した場合、ダメージ計算へのテラスタルの影響は自動的に反映される可能性がある。

#### テラスタルのドメインルール（予定）

| ルール | 説明 |
|---|---|
| タイプ変更 | テラスタル中はテラスタイプ単体になる |
| STAB 変更 | テラスタイプがタイプ一致に追加される |
| 1試合1回 | メガシンカと同様、1試合につき1回のみ |

※ ゲーム仕様確定後にドメインルールを精緻化する。現時点では YAGNI 原則に従い実装しない。

### 8.3 API サーバー構想

| 項目 | 方針 |
|---|---|
| パッケージ | `packages/api-server` |
| API 形式 | REST API |
| エンドポイント設計 | MCP ツールと 1:1 に対応 |
| shared の再利用 | 型定義・分析ロジックをそのまま利用する |
| 認証・レート制限 | 段階的に導入（下記参照） |

#### エンドポイント一覧（予定）

| メソッド | パス | 対応する MCP ツール |
|---|---|---|
| POST | `/api/damage/single` | `calculate_damage_single` |
| POST | `/api/damage/all-moves` | `calculate_damage_all_moves` |
| POST | `/api/damage/party-matchup` | `calculate_damage_party_matchup` |
| POST | `/api/selection/analyze` | `analyze_selection` |
| POST | `/api/party/analyze-weakness` | `analyze_party_weakness` |

入出力は MCP ツールと同一構造にし、ドキュメントやクライアントの知識を共有できるようにする。

#### 認証・レート制限の導入計画

| フェーズ | 内容 |
|---|---|
| Phase 1 | API キーによる認証 |
| Phase 2 | レート制限の導入 |

詳細は API サーバー実装時に設計する。

### 8.4 Web UI 構想

| 項目 | 方針 |
|---|---|
| 依存先 | api-server のみに依存（shared を直接参照しない） |
| フレームワーク | 未定（React 系を想定） |
| 機能スコープ | ダメージ計算・パーティ弱点分析が中心 |

選出アドバイスは AI の思考が必要なため、Web UI 単体での提供は限定的とする。

### 8.5 優先度と実施判断

| 拡張項目 | 実施タイミング | 実施条件 |
|---|---|---|
| テラスタル対応 | ゲームアップデート後 | テラスタルの仕様が確定した時点 |
| API サーバー | MCP サーバーの安定稼働後 | 広いユーザー層への提供需要が生まれた時点 |
| Web UI | API サーバーの実装後 | ブラウザ向け UI の需要が確認された時点 |

いずれの拡張も、shared パッケージの分析ロジックには手を加えず、新しいインターフェース層を追加する形で実現する（テラスタル対応を除く）。

### 8.6 npm publish 時の注意事項

npm publish 時に意図しないファイルが公開されないよう、package.json の `files` フィールドで公開ファイルを明示的に制御すること。名前変換マッピングデータ（`data/` ディレクトリ）は publish 対象に含める必要がある。
