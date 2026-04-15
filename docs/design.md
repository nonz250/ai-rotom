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

### 4.1 データカテゴリ一覧

`@ai-rotom/data` パッケージで管理するデータカテゴリと、ドメインモデルとの対応を以下に示す。

| カテゴリ | データファイル | 対応するドメインモデル | 概要 |
|---|---|---|---|
| ポケモン | `pokemon.json` | Pokemon Entity | 種族値・タイプ・特性・覚える技・メガシンカ情報 |
| 技 | `moves.json` | Move Entity | 技名・タイプ・威力・命中率・分類・優先度 |
| 特性 | `abilities.json` | Ability Entity | 特性名・効果説明 |
| タイプ相性 | `type-matchups.json` | TypeMatchup ValueObject | 攻撃タイプ × 防御タイプの倍率マトリクス |
| 性格 | `natures.json` | Nature ValueObject | 性格名・上昇/下降ステータス |
| 持ち物 | `items.json` | BattlePokemon Entity の item フィールド | 持ち物名・効果説明 |

### 4.2 JSON スキーマ定義

各データファイルのスキーマを定義する。すべてのデータは日本語名（`nameJa`）と英語名（`nameEn`）の両方を持つ。

#### 4.2.1 pokemon.json

ポケモンの種族データ。配列形式で全ポケモンを格納する。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | Yes | 一意識別子（全国図鑑番号ベース。例: `"0006"`, `"0006-mega-x"`） |
| `dexNumber` | number | Yes | 全国図鑑番号 |
| `nameJa` | string | Yes | 日本語名 |
| `nameEn` | string | Yes | 英語名 |
| `types` | string[] | Yes | タイプ（1つまたは2つ） |
| `baseStats` | object | Yes | 種族値 |
| `baseStats.hp` | number | Yes | HP |
| `baseStats.attack` | number | Yes | こうげき |
| `baseStats.defense` | number | Yes | ぼうぎょ |
| `baseStats.specialAttack` | number | Yes | とくこう |
| `baseStats.specialDefense` | number | Yes | とくぼう |
| `baseStats.speed` | number | Yes | すばやさ |
| `abilityIds` | string[] | Yes | 取りうる特性の ID リスト |
| `learnableMoveIds` | string[] | Yes | 覚えられる技の ID リスト |
| `megaEvolutions` | object[] | Yes | メガシンカ先のリスト（メガシンカ不可の場合は空配列） |
| `megaEvolutions[].id` | string | Yes | メガシンカ先の ID（例: `"0006-mega-x"`） |
| `megaEvolutions[].nameJa` | string | Yes | メガシンカ先の日本語名 |
| `megaEvolutions[].nameEn` | string | Yes | メガシンカ先の英語名 |
| `megaEvolutions[].types` | string[] | Yes | メガシンカ後のタイプ |
| `megaEvolutions[].baseStats` | object | Yes | メガシンカ後の種族値（構造は `baseStats` と同一） |
| `megaEvolutions[].abilityId` | string | Yes | メガシンカ後の特性 ID |
| `megaEvolutions[].requiredItemId` | string | Yes | メガシンカに必要な持ち物の ID |

**例: リザードンのデータ**

```json
{
  "id": "0006",
  "dexNumber": 6,
  "nameJa": "リザードン",
  "nameEn": "Charizard",
  "types": ["ほのお", "ひこう"],
  "baseStats": {
    "hp": 78,
    "attack": 84,
    "defense": 78,
    "specialAttack": 109,
    "specialDefense": 85,
    "speed": 100
  },
  "abilityIds": ["blaze", "solar-power"],
  "learnableMoveIds": [
    "flamethrower", "fire-blast", "air-slash", "dragon-pulse",
    "solar-beam", "focus-blast", "roost", "will-o-wisp"
  ],
  "megaEvolutions": [
    {
      "id": "0006-mega-x",
      "nameJa": "メガリザードンX",
      "nameEn": "Mega Charizard X",
      "types": ["ほのお", "ドラゴン"],
      "baseStats": {
        "hp": 78,
        "attack": 130,
        "defense": 111,
        "specialAttack": 130,
        "specialDefense": 85,
        "speed": 100
      },
      "abilityId": "tough-claws",
      "requiredItemId": "charizardite-x"
    },
    {
      "id": "0006-mega-y",
      "nameJa": "メガリザードンY",
      "nameEn": "Mega Charizard Y",
      "types": ["ほのお", "ひこう"],
      "baseStats": {
        "hp": 78,
        "attack": 104,
        "defense": 78,
        "specialAttack": 159,
        "specialDefense": 115,
        "speed": 100
      },
      "abilityId": "drought",
      "requiredItemId": "charizardite-y"
    }
  ]
}
```

#### 4.2.2 moves.json

技データ。配列形式で全技を格納する。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | Yes | 一意識別子（英語名のケバブケース。例: `"flamethrower"`） |
| `nameJa` | string | Yes | 日本語名 |
| `nameEn` | string | Yes | 英語名 |
| `type` | string | Yes | タイプ |
| `category` | string | Yes | 分類（`"physical"` / `"special"` / `"status"`） |
| `power` | number \| null | Yes | 威力（変化技は `null`） |
| `accuracy` | number \| null | Yes | 命中率（必中技は `null`） |
| `priority` | number | Yes | 優先度（通常は `0`、先制技は `+1` 以上） |
| `descriptionJa` | string | Yes | 効果説明（日本語） |
| `descriptionEn` | string | Yes | 効果説明（英語） |

**例:**

```json
[
  {
    "id": "flamethrower",
    "nameJa": "かえんほうしゃ",
    "nameEn": "Flamethrower",
    "type": "ほのお",
    "category": "special",
    "power": 90,
    "accuracy": 100,
    "priority": 0,
    "descriptionJa": "相手に大量の炎を発射して攻撃する。やけど状態にすることがある。",
    "descriptionEn": "The target is scorched with an intense blast of fire. This may also leave the target with a burn."
  },
  {
    "id": "protect",
    "nameJa": "まもる",
    "nameEn": "Protect",
    "type": "ノーマル",
    "category": "status",
    "power": null,
    "accuracy": null,
    "priority": 4,
    "descriptionJa": "相手の攻撃をまったく受けない。連続で出すと失敗しやすくなる。",
    "descriptionEn": "This move enables the user to protect itself from all attacks. Its chance of failing rises if it is used in succession."
  }
]
```

#### 4.2.3 abilities.json

特性データ。配列形式で全特性を格納する。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | Yes | 一意識別子（英語名のケバブケース。例: `"blaze"`） |
| `nameJa` | string | Yes | 日本語名 |
| `nameEn` | string | Yes | 英語名 |
| `descriptionJa` | string | Yes | 効果説明（日本語） |
| `descriptionEn` | string | Yes | 効果説明（英語） |

**例:**

```json
[
  {
    "id": "blaze",
    "nameJa": "もうか",
    "nameEn": "Blaze",
    "descriptionJa": "HPが減ったときほのおタイプの技の威力が上がる。",
    "descriptionEn": "Powers up Fire-type moves when the Pokémon's HP is low."
  }
]
```

#### 4.2.4 type-matchups.json

タイプ相性の倍率マトリクス。攻撃タイプをキー、防御タイプごとの倍率をマッピングする。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `[attackType]` | object | Yes | 攻撃タイプをキーとしたオブジェクト |
| `[attackType][defenseType]` | number | Yes | 倍率（`0`, `0.5`, `1`, `2` のいずれか） |

等倍（`1`）のエントリも省略せずすべて記載する。これにより、データの欠落と等倍を区別でき、バリデーションも容易になる。

**例（一部抜粋）:**

```json
{
  "ほのお": {
    "ノーマル": 1,
    "ほのお": 0.5,
    "みず": 0.5,
    "くさ": 2,
    "こおり": 2,
    "むし": 2,
    "いわ": 0.5,
    "ドラゴン": 0.5,
    "はがね": 2
  }
}
```

複合タイプの倍率は TypeMatchupEvaluator（ドメインサービス）側で各タイプの倍率を乗算して算出する。このデータファイルは単タイプ同士の倍率のみを保持する。

#### 4.2.5 natures.json

性格データ。全25種を配列形式で格納する。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | Yes | 一意識別子（英語名のケバブケース。例: `"adamant"`） |
| `nameJa` | string | Yes | 日本語名 |
| `nameEn` | string | Yes | 英語名 |
| `increasedStat` | string \| null | Yes | 上昇するステータス（無補正は `null`） |
| `decreasedStat` | string \| null | Yes | 下降するステータス（無補正は `null`） |

**例:**

```json
[
  {
    "id": "adamant",
    "nameJa": "いじっぱり",
    "nameEn": "Adamant",
    "increasedStat": "attack",
    "decreasedStat": "specialAttack"
  },
  {
    "id": "serious",
    "nameJa": "まじめ",
    "nameEn": "Serious",
    "increasedStat": null,
    "decreasedStat": null
  }
]
```

#### 4.2.6 items.json

持ち物データ。メガストーンを含む対戦に影響する持ち物を配列形式で格納する。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | Yes | 一意識別子（英語名のケバブケース。例: `"life-orb"`） |
| `nameJa` | string | Yes | 日本語名 |
| `nameEn` | string | Yes | 英語名 |
| `category` | string | Yes | 分類（`"mega-stone"` / `"battle-item"` / `"berry"` / `"other"`） |
| `descriptionJa` | string | Yes | 効果説明（日本語） |
| `descriptionEn` | string | Yes | 効果説明（英語） |

**例:**

```json
[
  {
    "id": "life-orb",
    "nameJa": "いのちのたま",
    "nameEn": "Life Orb",
    "category": "battle-item",
    "descriptionJa": "持たせると技の威力が1.3倍になるがHPが減る。",
    "descriptionEn": "An item to be held by a Pokémon. It boosts the power of moves, but at the cost of some HP on each hit."
  }
]
```

### 4.3 ディレクトリ構成

```
packages/data/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                          # 公開 API（全データのエクスポート）
│   ├── types.ts                          # データの TypeScript 型定義
│   ├── pokemon/
│   │   ├── index.ts                      # ポケモンデータのエクスポート・アクセス関数
│   │   └── pokemon.json                  # ポケモン種族データ
│   ├── moves/
│   │   ├── index.ts                      # 技データのエクスポート・アクセス関数
│   │   └── moves.json                    # 技データ
│   ├── abilities/
│   │   ├── index.ts                      # 特性データのエクスポート・アクセス関数
│   │   └── abilities.json                # 特性データ
│   ├── types/
│   │   ├── index.ts                      # タイプ相性データのエクスポート・アクセス関数
│   │   └── type-matchups.json            # タイプ相性マトリクス
│   ├── natures/
│   │   ├── index.ts                      # 性格データのエクスポート・アクセス関数
│   │   └── natures.json                  # 性格データ
│   └── items/
│       ├── index.ts                      # 持ち物データのエクスポート・アクセス関数
│       └── items.json                    # 持ち物データ
└── scripts/
    ├── fetch-base-data.ts                # 外部 API からの基本データ取得スクリプト
    ├── apply-champions-overrides.ts      # チャンピオンズ固有データの差分適用スクリプト
    ├── validate-data.ts                  # データ整合性バリデーションスクリプト
    └── overrides/
        ├── pokemon-overrides.json        # ポケモンデータの差分定義
        ├── moves-overrides.json          # 技データの差分定義
        └── abilities-overrides.json      # 特性データの差分定義
```

### 4.4 データ収集・更新フロー

データの初期生成とゲームアップデート時の更新は、以下の 3 段階で行う。

```
外部 API ──→ fetch-base-data.ts ──→ 基本データ（JSON）
                                          │
チャンピオンズ差分 ──→ apply-champions-overrides.ts ──→ 最終データ（JSON）
                                                            │
                                          validate-data.ts ──→ バリデーション通過後にコミット
```

#### Stage 1: 基本データ取得（`fetch-base-data.ts`）

外部 API から以下の基本データを取得し、本プロジェクトの JSON スキーマに変換して出力する。

| 取得対象 | 出力先 | 備考 |
|---|---|---|
| ポケモン種族データ | `pokemon.json` | 種族値・タイプ・特性・覚える技 |
| 技データ | `moves.json` | 名前・タイプ・威力・命中率・分類 |
| 特性データ | `abilities.json` | 名前・効果説明 |
| タイプ相性 | `type-matchups.json` | 18×18 の倍率マトリクス |

性格データ（`natures.json`）はゲーム間で変わらない固定データのため、手動で作成しスクリプト対象外とする。

#### Stage 2: チャンピオンズ差分適用（`apply-champions-overrides.ts`）

Stage 1 で取得した基本データに、チャンピオンズ固有の差分を上書き適用する。差分は `scripts/overrides/` 配下の JSON ファイルに定義する。

**差分 JSON のフォーマット:**

```json
{
  "add": [
    { "id": "new-pokemon", "...": "新規追加データ" }
  ],
  "update": [
    { "id": "0006", "learnableMoveIds": ["変更後の技リスト"] }
  ],
  "remove": ["削除する ID"]
}
```

#### Stage 3: バリデーション（`validate-data.ts`）

最終データの整合性を検証する。

| 検証項目 | 内容 |
|---|---|
| スキーマ検証 | 各 JSON が定義済みスキーマに適合するか |
| 参照整合性 | ポケモンの `abilityIds` が `abilities.json` に存在するか |
| 参照整合性 | ポケモンの `learnableMoveIds` が `moves.json` に存在するか |
| 参照整合性 | メガシンカの `requiredItemId` が `items.json` に存在するか |
| タイプ相性の完全性 | 18タイプ × 18タイプの全324エントリが存在するか |
| 性格データの完全性 | 全25性格が含まれているか |

### 4.5 データのバージョニング

#### 方針

ゲームアップデートへの対応は、データファイルをバージョン管理（Git）で追跡することで実現する。専用のバージョニング機構は設けない。

#### ゲームアップデート時の更新手順

```
1. fetch-base-data.ts を再実行し、基本データを最新化
2. overrides/ の差分定義を更新（新たな変更点を反映）
3. apply-champions-overrides.ts を実行し、差分を適用
4. validate-data.ts を実行し、整合性を確認
5. Git diff で変更内容を確認し、コミット
```

#### データメタ情報

各データファイルの更新日時とゲームバージョンを追跡するため、`src/meta.json` を配置する。

```json
{
  "gameVersion": "1.0.0",
  "lastUpdated": "2026-04-15",
  "dataSource": {
    "baseData": "外部 API から自動取得",
    "overrides": "攻略サイト・ゲーム内検証から手動補完"
  }
}
```

#### データ範囲

チャンピオンズに登場する全ポケモンを対象とする。チャンピオンズに登場しないポケモンのデータは、Stage 2 の差分適用時にフィルタリングして除外する。

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
| attacker | BattlePokemon | Yes | 攻撃側ポケモン |
| defender | BattlePokemon | Yes | 防御側ポケモン |
| move | Move | Yes | 使用する技 |
| conditions | BattleConditions | No | バトル環境条件（天候・フィールド） |

##### AllMoves（1対1の全技）

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| attacker | BattlePokemon | Yes | 攻撃側ポケモン |
| defender | BattlePokemon | Yes | 防御側ポケモン |
| conditions | BattleConditions | No | バトル環境条件（天候・フィールド） |

##### PartyMatchup（パーティ対パーティ）

| パラメータ | 型 | 必須 | 説明 |
|---|---|---|---|
| attackerParty | Party | Yes | 攻撃側パーティ |
| defenderParty | Party | Yes | 防御側パーティ |
| conditions | BattleConditions | No | バトル環境条件（天候・フィールド） |

##### BattleConditions

バトル環境条件を表す ValueObject。

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

##### Single の出力: DamageResult

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

##### AllMoves の出力: AllMovesResult

| 属性 | 型 | 説明 |
|---|---|---|
| attackerName | string | 攻撃側ポケモン名 |
| defenderName | string | 防御側ポケモン名 |
| results | DamageResult[] | 各技のダメージ計算結果（変化技を除く） |

##### PartyMatchup の出力: PartyMatchupResult

| 属性 | 型 | 説明 |
|---|---|---|
| attackerPartyMembers | string[] | 攻撃側パーティメンバー名リスト |
| defenderPartyMembers | string[] | 防御側パーティメンバー名リスト |
| matchups | AllMovesResult[][] | 2次元配列。matchups[i][j] は攻撃側 i 番目 → 防御側 j 番目 |

#### 5.1.4 処理フロー

```
入力（BattlePokemon, Move, BattleConditions）
  │
  ▼
① StatCalculator で攻撃側・防御側の実数値を計算
  │  - 攻撃側: 物理技なら「こうげき」、特殊技なら「とくこう」の実数値
  │  - 防御側: 物理技なら「ぼうぎょ」、特殊技なら「とくぼう」の実数値
  │
  ▼
② ダメージ基本式を適用
  │  ダメージ = (((レベル × 2 / 5 + 2) × 威力 × 攻撃実数値 / 防御実数値) / 50 + 2)
  │
  ▼
③ 各補正を乗算
  │  a. タイプ一致ボーナス（STAB: 1.5倍）
  │  b. タイプ相性倍率（TypeMatchupEvaluator に委譲）
  │  c. 天候補正（BattleConditions から判定）
  │  d. フィールド補正（BattleConditions から判定）
  │  e. 持ち物補正（段階的に実装）
  │  f. 特性補正（段階的に実装）
  │
  ▼
④ 乱数幅を適用
  │  - 0.85〜1.00 の16段階（0.85, 0.86, ..., 1.00）
  │  - 最小ダメージ = ③の結果 × 0.85（小数切り捨て）
  │  - 最大ダメージ = ③の結果 × 1.00
  │
  ▼
⑤ HP 割合と確定数を算出
  │  - HP 割合 = ダメージ / 防御側の HP 実数値 × 100
  │  - 確定数 = ceil(防御側の HP 実数値 / 最小ダメージ)
  │
  ▼
⑥ DamageResult を構築して返却
```

**AllMoves の処理フロー:**
- 攻撃側の moves から変化技（category が `"status"`）を除外する
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
| myParty | Party | Yes | 自分のパーティ |
| opponentParty | Party | Yes | 相手のパーティ |
| battleFormat | BattleFormat | Yes | バトル形式（シングル / ダブル） |
| conditions | BattleConditions | No | バトル環境条件（天候・フィールド） |

```typescript
type BattleFormat = "singles" | "doubles";
```

#### 5.2.3 出力: SelectionAnalysis

| 属性 | 型 | 説明 |
|---|---|---|
| typeMatchupSummary | TypeMatchupSummary | タイプ相性の要約 |
| damageAnalysis | PartyMatchupResult | 双方向のダメージ計算結果 |
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
  │ TypeMatchup      │ DamageCalculator │ SpeedComparator
  │ Evaluator        │ .calculateParty  │ + StatCalculator
  │ を使用           │  Matchup を使用   │ を使用
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
| party | Party | Yes | 分析対象のパーティ（1〜6体） |

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
入力（Party）
  │
  ▼
① 各メンバーのタイプ相性プロファイルを作成
  │  - TypeMatchupEvaluator で弱点・耐性・無効を算出
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

_（後続で記載予定）_

## 7. テスト戦略

_（後続で記載予定）_

## 8. 拡張計画

_（後続で記載予定）_
