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

### 3.1 基本思想

**「プログラムは正確なデータを出す。AI はデータを元に考える。」**

ai-rotom の設計において、プログラム（MCP ツール）と AI（LLM）の責務を明確に分離する。プログラムは計算やデータの提供に徹し、解釈・判断・提案は AI に委ねる。

| 機能 | プログラム（ツール）の責務 | AI の責務 |
|---|---|---|
| ダメージ計算 | 正確な数値計算（3粒度：1対1の1技、1対1の全技、パーティ対パーティ） | 結果の解釈・説明 |
| 選出アドバイス | タイプ相性・ダメ計・素早さ等のデータ提供 | データを総合して選出を判断・提案 |
| パーティ構築 | パーティの弱点分析（タイプ相性の穴の洗い出し） | 弱点を踏まえた構築案の提案 |

この分離により、プログラムは「正確さ」に集中し、AI は「思考の質」に集中できる。

### 3.2 ドメインモデル一覧

#### ValueObject

| ValueObject | 配置先 | 概要 |
|---|---|---|
| Type | `domain/model/pokemon/` | タイプ（ほのお、みず等の18種） |
| TypeMatchup | `domain/model/battle/` | タイプ相性（攻撃タイプ → 防御タイプ → 倍率） |
| Stats | `domain/model/pokemon/` | 種族値（HP, こうげき, ぼうぎょ, とくこう, とくぼう, すばやさ） |
| AbilityPoints | `domain/model/battle/` | 能力ポイント配分（各ステータスへの加算値） |
| Nature | `domain/model/pokemon/` | 性格（上昇ステータス、下降ステータス） |
| DamageResult | `domain/model/battle/` | ダメージ計算結果（最小ダメージ、最大ダメージ、割合、確定数） |

#### Entity

| Entity | 配置先 | 概要 |
|---|---|---|
| Pokemon | `domain/model/pokemon/` | ポケモンの種族データ（種族値、タイプ、特性、覚える技リスト等） |
| Move | `domain/model/move/` | 技（名前、タイプ、威力、命中率、分類） |
| Ability | `domain/model/pokemon/` | 特性（名前、効果） |
| BattlePokemon | `domain/model/battle/` | 対戦用ポケモン（種族データ + 育成データ + 構成） |
| Party | `domain/model/party/` | パーティ（BattlePokemon の集合、最大6体） |

#### DomainService

| DomainService | 配置先 | 概要 |
|---|---|---|
| DamageCalculator | `domain/service/` | ダメージ計算（乱数幅を含む正確な数値計算） |
| TypeMatchupEvaluator | `domain/service/` | タイプ相性の評価（複合タイプ対応） |
| StatCalculator | `domain/service/` | 実数値計算（種族値 + 個体値[固定31] + 能力ポイント + 性格補正） |
| SpeedComparator | `domain/service/` | 素早さ比較（実数値に基づく行動順の判定） |

### 3.3 ValueObject 詳細

#### Type

ポケモンのタイプを表す。全18種を列挙型として定義する。

| 属性 | 型 | 説明 |
|---|---|---|
| value | string（列挙） | タイプ名（ノーマル, ほのお, みず, でんき, くさ, こおり, かくとう, どく, じめん, ひこう, エスパー, むし, いわ, ゴースト, ドラゴン, あく, はがね, フェアリー） |

- 不変（イミュータブル）
- 等価性はタイプ名で判定する

#### TypeMatchup

攻撃タイプと防御タイプの組み合わせに対する倍率を表す。

| 属性 | 型 | 説明 |
|---|---|---|
| attackType | Type | 攻撃側のタイプ |
| defenseType | Type | 防御側のタイプ |
| multiplier | number | 倍率（0, 0.25, 0.5, 1, 2, 4） |

- 防御側が複合タイプの場合、各タイプの倍率を乗算して最終倍率を算出する
- チャンピオンズ固有の表記との対応：

| 倍率 | 表記 |
|---|---|
| 4 | こうかちょうバツグン |
| 2 | こうかはバツグンだ |
| 1 | 等倍 |
| 0.5 | こうかはいまひとつ |
| 0.25 | かなりいまひとつ |
| 0 | こうかがないみたい |

#### Stats

ポケモンの種族値を表す。6つのステータスを持つ。

| 属性 | 型 | 説明 |
|---|---|---|
| hp | number | HP |
| attack | number | こうげき |
| defense | number | ぼうぎょ |
| specialAttack | number | とくこう |
| specialDefense | number | とくぼう |
| speed | number | すばやさ |

- 不変（イミュータブル）
- 各値は正の整数

#### AbilityPoints

能力ポイントの配分を表す。チャンピオンズ固有の仕様として、実数値に直接加算される。

| 属性 | 型 | 説明 |
|---|---|---|
| hp | number | HP への加算値 |
| attack | number | こうげきへの加算値 |
| defense | number | ぼうぎょへの加算値 |
| specialAttack | number | とくこうへの加算値 |
| specialDefense | number | とくぼうへの加算値 |
| speed | number | すばやさへの加算値 |

- 不変（イミュータブル）
- 各値は 0 以上の整数
- 配分の上限ルールはゲーム仕様確定後に制約として追加する

#### Nature

ポケモンの性格を表す。上昇するステータスと下降するステータスを持つ。

| 属性 | 型 | 説明 |
|---|---|---|
| name | string | 性格名（いじっぱり、ひかえめ等） |
| increasedStat | StatType \| null | 上昇するステータス（HP 以外の5種、無補正の場合は null） |
| decreasedStat | StatType \| null | 下降するステータス（HP 以外の5種、無補正の場合は null） |

- 上昇・下降ステータスの補正倍率は 1.1 倍 / 0.9 倍
- 無補正性格（まじめ、がんばりや等）は increasedStat, decreasedStat がともに null

#### DamageResult

ダメージ計算の結果を表す。

| 属性 | 型 | 説明 |
|---|---|---|
| minDamage | number | 最小ダメージ（乱数最低） |
| maxDamage | number | 最大ダメージ（乱数最高） |
| minPercentage | number | 最小ダメージの HP 割合（%） |
| maxPercentage | number | 最大ダメージの HP 割合（%） |
| guaranteedKnockouts | number | 確定数（確定1発 = 1、確定2発 = 2、...） |

- HP 割合はパーセンテージで表現する（ゲーム内表示と合わせるため）
- 確定数は最小ダメージ基準で算出する

### 3.4 Entity 詳細

#### Pokemon

ポケモンの種族データを表す。図鑑データに相当し、個体の育成状態は含まない。

| 属性 | 型 | 説明 |
|---|---|---|
| id | string | ポケモンの一意識別子（全国図鑑番号ベース） |
| name | string | ポケモン名 |
| types | Type[] | タイプ（1つまたは2つ） |
| baseStats | Stats | 種族値 |
| abilities | AbilityId[] | 取りうる特性の ID リスト |
| learnableMoveIds | MoveId[] | 覚えられる技の ID リスト |
| megaEvolutions | MegaEvolution[] | メガシンカ先のリスト（メガシンカ不可の場合は空配列） |

- 識別子は全国図鑑番号をベースにする（フォルム違いはサフィックスで区別）
- メガシンカ先はタイプ・種族値・特性が変化するため、別途 MegaEvolution 型で保持する

#### Move

技を表す。

| 属性 | 型 | 説明 |
|---|---|---|
| id | string | 技の一意識別子 |
| name | string | 技名 |
| type | Type | タイプ |
| category | MoveCategory | 分類（物理 / 特殊 / 変化） |
| power | number \| null | 威力（変化技は null） |
| accuracy | number \| null | 命中率（必中技は null） |
| priority | number | 優先度（先制技は +1 以上） |

- MoveCategory は「physical（物理）」「special（特殊）」「status（変化）」の3値の列挙型
- 変化技はダメージ計算の対象外とする

#### Ability

ポケモンの特性を表す。

| 属性 | 型 | 説明 |
|---|---|---|
| id | string | 特性の一意識別子 |
| name | string | 特性名 |
| description | string | 特性の効果説明 |

- ダメージ計算に影響する特性（もらいび、かんそうはだ等）は DamageCalculator 側で個別にハンドリングする
- 特性の効果ロジックは段階的に実装する

#### BattlePokemon

対戦で使用する個体を表す。種族データに育成状態と構成を加えたもの。

| 属性 | 型 | 説明 |
|---|---|---|
| id | string | 対戦用ポケモンの一意識別子 |
| pokemon | Pokemon | ベースとなる種族データ |
| nature | Nature | 性格 |
| abilityPoints | AbilityPoints | 能力ポイント配分 |
| ability | Ability | 選択した特性 |
| moves | Move[] | 技構成（最大4つ） |
| item | string \| null | 持ち物（未設定の場合は null） |
| isMegaEvolved | boolean | メガシンカ状態かどうか |

- 個体値は全ポケモン一律31固定のため、フィールドとして持たない（StatCalculator 内で定数 `MAX_IV = 31` として扱う）
- メガシンカ時は pokemon のタイプ・種族値・特性が変化する
- 技は1〜4つ（空は許可しない）

#### Party

対戦パーティを表す。BattlePokemon の集合。

| 属性 | 型 | 説明 |
|---|---|---|
| id | string | パーティの一意識別子 |
| members | BattlePokemon[] | パーティメンバー（1〜6体） |

- メンバー数の制約：最小1体、最大6体
- 同一ポケモンの重複ルールはゲーム仕様に準拠する
- パーティ内でメガシンカできるのは1体のみ（ビジネスルールとしてバリデーション）

### 3.5 DomainService 詳細

#### DamageCalculator

ダメージ計算を行う。3つの粒度で計算を提供する。

| メソッド | 入力 | 出力 | 説明 |
|---|---|---|---|
| calculateSingle | 攻撃側 BattlePokemon, 防御側 BattlePokemon, Move | DamageResult | 1対1の1技ダメージ |
| calculateAllMoves | 攻撃側 BattlePokemon, 防御側 BattlePokemon | DamageResult[] | 1対1の全技ダメージ |
| calculatePartyMatchup | 攻撃側 Party, 防御側 Party | DamageResult[][] | パーティ対パーティの全組み合わせ |

計算要素：
- タイプ一致ボーナス（STAB: 1.5倍）
- タイプ相性倍率（TypeMatchupEvaluator に委譲）
- 攻撃側の実数値（StatCalculator に委譲）
- 防御側の実数値（StatCalculator に委譲）
- 乱数幅（0.85〜1.00 の16段階）
- 持ち物・特性による補正（段階的に実装）

#### TypeMatchupEvaluator

タイプ相性の評価を行う。

| メソッド | 入力 | 出力 | 説明 |
|---|---|---|---|
| evaluate | 攻撃 Type, 防御 Type[] | number | 攻撃タイプに対する防御側（複合タイプ対応）の倍率 |
| getWeaknesses | Type[] | Type[] | 弱点タイプの一覧 |
| getResistances | Type[] | Type[] | 耐性タイプの一覧 |
| getImmunities | Type[] | Type[] | 無効タイプの一覧 |

- 複合タイプの場合は各タイプの倍率を乗算する
- 特性による相性変更（ふゆう等）は本サービスでは扱わない（DamageCalculator 側で補正）

#### StatCalculator

実数値の計算を行う。チャンピオンズ固有の計算式を使用する。

| メソッド | 入力 | 出力 | 説明 |
|---|---|---|---|
| calculate | baseStats: Stats, abilityPoints: AbilityPoints, nature: Nature, level: number | Stats | 全ステータスの実数値を計算 |
| calculateSingle | baseStat: number, abilityPoint: number, natureMultiplier: number, level: number, isHp: boolean | number | 単一ステータスの実数値を計算 |

定数：
- `MAX_IV = 31`（個体値は全ポケモン一律固定）
- `DEFAULT_LEVEL = 50`（対戦レベル）

計算式（HP）：
```
HP実数値 = (種族値 × 2 + 個体値) × レベル / 100 + レベル + 10 + 能力ポイント
```

計算式（HP 以外）：
```
実数値 = ((種族値 × 2 + 個体値) × レベル / 100 + 5) × 性格補正 + 能力ポイント
```

※ 計算式はゲーム仕様確定後に検証・修正する可能性がある。

#### SpeedComparator

素早さの比較を行い、行動順を判定する。

| メソッド | 入力 | 出力 | 説明 |
|---|---|---|---|
| compare | BattlePokemon, BattlePokemon | CompareResult | 2体の素早さを比較 |
| sortBySpeed | BattlePokemon[] | BattlePokemon[] | 素早さ順にソート |

- 実数値の計算は StatCalculator に委譲する
- 素早さが同値の場合はランダム（結果に「同速」として明示する）
- 先制技・後攻技の優先度は Move の priority を参照する
- トリックルーム等の状態異常による順序反転は将来対応とする

### 3.6 テラスタル対応の拡張設計

テラスタルは現時点で未実装だが、将来追加予定である。以下の拡張ポイントを考慮した設計にする。

| 拡張箇所 | 対応方針 |
|---|---|
| BattlePokemon | テラスタイプ（Type \| null）を追加 |
| DamageCalculator | テラスタル時のタイプ一致ボーナス計算を追加 |
| TypeMatchupEvaluator | テラスタル時の防御側タイプ変更を考慮 |

現時点ではこれらのフィールド・ロジックは実装しない。テラスタルに関わるインターフェースを今の段階で追加することは YAGNI 原則に反するため、拡張箇所の認識のみ記録に留める。

### 3.7 ドメインモデル間の関係

```
Party
 └── members: BattlePokemon[]
       ├── pokemon: Pokemon
       │    ├── types: Type[]
       │    ├── baseStats: Stats
       │    ├── abilities: AbilityId[]
       │    ├── learnableMoveIds: MoveId[]
       │    └── megaEvolutions: MegaEvolution[]
       ├── nature: Nature
       ├── abilityPoints: AbilityPoints
       ├── ability: Ability
       └── moves: Move[]
             ├── type: Type
             └── category: MoveCategory

DamageCalculator
 ├── uses: TypeMatchupEvaluator
 ├── uses: StatCalculator
 └── produces: DamageResult

SpeedComparator
 └── uses: StatCalculator
```

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
