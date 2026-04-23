# ai-rotom

ポケモンチャンピオンズの対戦アドバイザー MCP サーバー。

## 基本思想

**「プログラムは正確なデータを出す。AI はデータを元に考える。」**

| 機能 | プログラム（ツール）の責務 | AI の責務 |
|---|---|---|
| ダメージ計算 | 正確な数値計算（1 対 1 / 全技 / 6v6 の 3 粒度） | 結果の解釈・説明 |
| 選出アドバイス | タイプ相性・ダメ計・素早さ等のデータ提供 | データを総合して選出を判断・提案 |
| パーティ構築 | パーティの弱点・攻撃範囲分析 | 構築案の提案 |
| 対策案 | 対策候補の提示（`find_counters`） | 勝ち筋の説明 |

## 技術スタック

- 言語: TypeScript 6（strict）
- ダメージ計算エンジン: `@smogon/calc` の Gen 0 (Champions)
  - npm 未 publish のため、`vendor/` 配下の tarball からインストール
- 入力検証: Zod
- パッケージ管理: npm workspaces（workspace は `packages/mcp-server` のみ）
- ビルド: tsdown（ESM bundle、JSON インライン化）
- テスト: Vitest
- Node.js: >= 24

## 開発コマンド

```bash
npm install          # 依存関係インストール
npm run build        # ビルド
npm test             # テスト実行
npm run test:watch   # テスト監視モード
```

## リポジトリ構成

```
ai-rotom/
├── tsconfig.base.json           # 共通 TypeScript 設定 (paths alias)
├── data/champions/              # マスターデータ (8 ファイル JSON)
│   ├── pokemon.json             # ポケモン (種族値・タイプ・特性等)
│   ├── abilities.json           # 特性
│   ├── items.json               # 持ち物
│   ├── moves.json               # 技
│   ├── learnsets.json           # 習得技
│   ├── natures.json             # 性格
│   ├── types.json               # タイプ (日英マッピング)
│   └── conditions.json          # 天候/フィールド/状態異常/壁
├── shared/                      # 単純ソースディレクトリ (package.json なし)
│   └── src/
│       ├── index.ts
│       ├── constants/           # DEFAULT_LEVEL, MAX_IV, 性格補正倍率 等
│       ├── utils/               # NameResolver
│       ├── schemas/             # Zod 入力スキーマ
│       ├── types/               # PokemonEntry, PokemonEntryProvider 等
│       ├── analysis/            # タイプ相性・実数値・素早さ比較
│       └── calc/                # ダメージ計算エンジン (DI 対応)
└── packages/
    └── mcp-server/              # 唯一の workspace パッケージ
        ├── src/
        │   ├── index.ts         # エントリ (#!/usr/bin/env node)
        │   ├── server.ts        # MCP サーバー + ツール登録
        │   ├── instructions.ts  # MCP instructions テキスト
        │   ├── data-store.ts    # JSON → Map + PokemonEntryProvider 実装
        │   ├── name-resolvers.ts
        │   └── tools/
        │       ├── info/        # 情報取得系
        │       ├── search/      # 逆引き検索系
        │       ├── calc/        # 計算系
        │       └── analysis/    # 分析系
        └── vendor/smogon-calc-0.11.0.tgz
```

- `packages/` は npm workspace 対象のパッケージのみを配置する
- `shared/` と `data/` は root 直下の「プロジェクト全体の資産」として同格

## パッケージ方針

| 区分 | 役割 |
|---|---|
| `packages/shared/` | ポケチャン対戦ロジックの再利用可能なコアライブラリ。型・定数・Zod スキーマ・分析ロジック・ダメ計エンジン。**具象データには依存しない（DI で受ける）** |
| `packages/mcp-server/` | MCP プロトコル対応と具象データ供給。JSON データを読み、shared の計算エンジンに注入するアプリケーション層 |
| `data/champions/` | ポケチャン固有のマスターデータ。将来の api-server / web-ui からも参照される資産 |

`shared` は npm パッケージではなく **単純なソースディレクトリ**。mcp-server から alias 経由で参照される。将来 api-server を同リポジトリに追加する場合も同じ alias で参照可能。

### 依存方向（守るべき）

```
mcp-server ──→ shared
mcp-server ──→ JSON (data/champions/)
shared ──→ @smogon/calc (ランタイム), zod
```

- **shared は mcp-server に依存しない**（mcp-server 固有の型・データを import しない）
- shared が具象データを必要とする場合は **dependency injection 経由**（`PokemonEntryProvider` 等）
- shared は `@smogon/calc` と `zod` のみランタイム依存を許容する

### publish 物における依存関係

shared コードは `@smogon/calc` をランタイム import するが、mcp-server の
publish 対象（`dist/index.mjs`）では tsdown の `deps.alwaysBundle` により
`@smogon/calc` を bundle inline 化する。publish 物の `package.json.dependencies`
には `@smogon/calc` を含めない（npm registry に未 publish のパッケージのため、
利用者環境で解決できず install に失敗する）。

- 開発時: monorepo root の `devDependencies` で `file:vendor/...` を解決
- publish 時: `dist/index.mjs` に全コードがインライン化され、利用者は追加 install 不要
- ライセンス義務は `packages/mcp-server/THIRD_PARTY_LICENSES.md` で満たす
- tarball の provenance は `vendor/README.md` に記録

### Alias 設定

TypeScript / Vitest / tsdown で以下の alias を共有:

- `@data/*` → `data/champions/*`（データ JSON）
- `@ai-rotom/shared` → `shared/src/index.ts`（shared ライブラリ）

**TypeScript**: ルートの `tsconfig.base.json` に paths を集約し、各パッケージの
`tsconfig.json` が `extends` で継承する。これにより新規パッケージ追加時は
tsconfig.base.json を extends するだけで alias が使える。

**rootDir**: mcp-server の `tsconfig.json` では `rootDir: "../.."` と monorepo
root に設定し、shared / data のファイルが alias 解決でプログラムに含まれても
TS6059 エラーにならないようにしている。

### 配布方法

- `npx @nonz250/ai-rotom` で MCP サーバーを起動できる（`bin: dist/index.mjs`）
- `dist/index.mjs` にインライン bundle するもの:
  - `data/champions/*.json`（マスターデータ）
  - `shared/src/*`（共有ライブラリ）
  - `@smogon/calc`（npm 未 publish のため bundle 必須）
- bundle しないもの（利用者環境で npm install される）:
  - `@modelcontextprotocol/sdk`, `zod`（npm registry 公開パッケージ）
- npm publish 時の同梱は `dist` / `LICENSE` / `THIRD_PARTY_LICENSES.md`（`files` フィールド参照）

### publish 後のチェックリスト

1. `npm view @nonz250/ai-rotom@<version> version` で registry 反映を確認
2. 空ディレクトリで `npx -y @nonz250/ai-rotom@<version>` を実行し stdio 起動確認
3. 不具合のあるバージョンが残っている場合は `npm deprecate` でユーザー誘導
   ```
   npm deprecate @nonz250/ai-rotom@<broken-version> "<message>"
   ```
4. GitHub Release に修正内容と関連バージョン情報を記載

## IMPORTANT: 外部サービス名の取り扱い

**データ取得元の外部サービス名（API 名・サイト名）をドキュメント・コミットメッセージ・PR 説明に記載しないこと。**
設計ドキュメントやコード内コメントでは「外部 API」「攻略サイト」等の一般的な表現を使うこと。

## MCP ツール

### 情報取得系
| ツール | 概要 |
|---|---|
| `get_pokemon_info` | ポケモンの基本情報（types/baseStats/abilities/weightkg） |
| `get_pokemon_summary` | ポケモンの総合プロファイル（defenses / learnableMoves / derivedStats） |
| `get_move_info` | 技の情報 |
| `get_ability_info` | 特性の情報 |
| `get_item_info` | 持ち物の情報 |
| `get_nature_info` | 性格の plus/minus |
| `get_type_info` | タイプ相性（攻撃時・受け時） |
| `get_condition_info` | 天候/フィールド/状態異常/壁 |
| `get_learnset` | 覚える技一覧 |

### 検索系
| ツール | 概要 |
|---|---|
| `search_pokemon` | タイプ・種族値条件で検索 |
| `search_pokemon_by_move` | 技を覚えるポケモン逆引き |
| `search_pokemon_by_ability` | 特性を持つポケモン逆引き |
| `search_pokemon_by_type_effectiveness` | タイプ相性条件で逆引き |

### 計算系
| ツール | 概要 |
|---|---|
| `calculate_stats` | 実数値計算 |
| `calculate_damage_single` | 1 対 1 の 1 技ダメ計 |
| `calculate_damage_all_moves` | 1 対 1 の全技ダメ計 |
| `calculate_damage_party_matchup` | 6v6 ダメ計 |
| `list_speed_tiers` | 素早さライン一覧 |
| `analyze_damage_range` | ダメ計＋耐久逆計算 |

### 分析系
| ツール | 概要 |
|---|---|
| `analyze_matchup` | 2 体対面分析 |
| `analyze_party_weakness` | パーティ弱点分析 |
| `analyze_party_coverage` | パーティ攻撃カバレッジ分析 |
| `analyze_selection` | 6v6 選出判断一括分析 |
| `find_counters` | 対策候補の双方向ダメ計・素早さ・タイプ相性（判断は AI 側） |

- MCP SDK: `@modelcontextprotocol/sdk`
- 入力は日本語名で受け付ける（内部で英語名に変換して `@smogon/calc` に渡す）
- 育成データ（nature / SP / ability 等）は省略可能（デフォルト値あり）

## データ修正方針

`data/champions/*.json` は以下を根拠に精度を高めている:

- **ベースデータ**: `@smogon/calc` Gen 0 (Champions) からの抽出
- **名前・PP・効果等**: 攻略サイトの公開情報と突合して訂正済み
- **メガシンカ特性・種族値**: 攻略サイト準拠で上書き（@smogon/calc Gen 0 の旧値を訂正）

### `@smogon/calc` との関係

実行時のダメ計は `@smogon/calc` Gen 0 を使う。ただし pokemon.json に修正版のデータを持ち、`DamageCalculatorAdapter` の `PokemonEntryProvider` 経由で `overrides` として `@smogon/calc` に注入する。これにより @smogon/calc 内蔵の古い値は上書きされる。

## テスト

- テストフレームワーク: Vitest
- 配置: コロケーション（`*.test.ts`）
- `@smogon/calc` 自体のテストは不要（ライブラリ側でテスト済み）

## ポケモンチャンピオンズ固有ルール

- **個体値**: 廃止。全ポケモン一律 31 固定（定数 `MAX_IV = 31`）
- **能力ポイント (SP)**: 旧「努力値 (EV)」から仕様変更。各ステ 0〜32（定数 `MAX_STAT_POINT_PER_STAT = 32`）、合計 0〜66（定数 `MAX_STAT_POINT_TOTAL = 66`）。1 SP = 実数値 +1 で直接加算
- **メガシンカ**: 1 試合につき 1 回のみ
- **テラスタル**: 未実装（YAGNI、ゲーム側で未対応）
- **対戦レベル**: 50 固定（定数 `DEFAULT_LEVEL = 50`）
- **特性**: 各ポケモン基本 1 特性（@smogon/calc Gen 0 仕様）。隠れ特性は pokemon.json で管理
