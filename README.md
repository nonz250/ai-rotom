# ai-rotom

ポケモンバトルアドバイザー。

Claude Code, Codex などの AI Agent から MCP ツールとして呼び出し、 ポケモンの種族値・技データ・タイプ相性・ダメージ計算・パーティ分析・選出判断に利用できます。

## 著作権・商標

本プロジェクトはポケモンの**ファンメイドツール**です。
**ポケモンに関する著作権・商標権はすべて権利者に帰属します。**

- © Nintendo / Creatures Inc. / GAME FREAK Inc.
- © Pokémon.
- 「ポケットモンスター」「ポケモン」「Pokémon」および関連する名称・ロゴは、任天堂株式会社、株式会社クリーチャーズ、株式会社ゲームフリーク、株式会社ポケモンの商標または登録商標です。
- 「ポケモンチャンピオンズ」および本ツールが対象とするゲームタイトルは上記権利者の著作物です。

### 本プロジェクトの位置付け

- 本プロジェクトは**ファンメイド作品** であり、ポケモンの**公式商品ではありません**。
- 任天堂株式会社、株式会社ポケモン、株式会社クリーチャーズ、株式会社ゲームフリークは、本プロジェクトに関与していません。
- 本プロジェクトは対戦研究・個人利用を目的としており、**商用を目的とするものではありません**。

### ライセンスと権利尊重について

本プロジェクトのソースコードは下記「ライセンス」セクションのとおり MIT License で配布されますが、**利用・改変・再配布に際してはポケモンに関する著作権・商標権を最大限尊重してください**。

具体的には以下の行為を避けてください:

- ポケモンの公式ツール・公式サービスであるかのように誤認させる表示
- ポケモン関連の著作物（ゲーム画像・音声・ロゴ等）を権利者の許諾なく本プロジェクトに同梱すること
- 権利者の利益を損なう形での商用利用

権利者から連絡をいただいた場合は、速やかに対応します。

## ライセンス

本プロジェクトのソースコードは [MIT License](./LICENSE) で提供されます。
ただし前述のとおり、ポケモンに関する権利は MIT License の対象ではなく、各権利者に帰属します。

## クイックスタート

### 前提

- Node.js >= 24

### 動作確認

```bash
npx -y ai-rotom
```

標準入出力で MCP プロトコルが動くため、実運用は下記の MCP クライアント経由で行います。

## MCP クライアント設定

### Claude Code

プロジェクトまたはユーザー設定に追加。

```bash
claude mcp add ai-rotom -- npx -y ai-rotom
```

### Codex

プロジェクトまたはユーザー設定に追加。

```bash
codex mcp add ai-rotom -- npx -y ai-rotom
```

## 利用可能な MCP ツール

プロンプトに入力する言語は日本語・英語どちらでも可能です。

### 情報取得系

| ツール | 概要 |
|---|---|
| `get_pokemon_info` | ポケモンの基本情報（種族値・タイプ・特性） |
| `get_pokemon_summary` | ポケモンの総合プロファイル（防御相性・覚える技の集計・実数値） |
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
| `analyze_damage_range` | ダメ計＋耐久逆計算（最小 SP 配分探索） |

### 分析系

| ツール | 概要 |
|---|---|
| `analyze_matchup` | 2 体対面分析 |
| `analyze_party_weakness` | パーティ弱点分析 |
| `analyze_party_coverage` | パーティ攻撃カバレッジ分析 |
| `analyze_selection` | 6v6 選出判断一括分析 |
| `find_counters` | 対策候補 TOP 10 |

## 使用例

AI クライアントに以下のように聞くと、内部でツールが自動で呼ばれます。

> 「カバルドンの対策候補を教えて」

e.g.) `find_counters` が呼ばれ、カバルドンの弱点タイプ（みず/くさ/こおり）を攻撃できるポケモン候補と、各候補のダメージ量・素早さ比較・対策戦略（速攻撃破 / 受け切り / タイプ受け）を返します。必要に応じてカバルドンの行動をプロンプトに入力し、あくび受けループに対する対策の検討をしてください。

> 「リザードン、ギャラドス、ピカチュウの 3 体パーティに足りないタイプ耐性は？」

e.g.) `analyze_party_weakness` が呼ばれ、致命的弱点・カバーが薄いタイプをレポートします。

## 既知の制限

- **一部ポケモン未登録**: ゲーム本編に登場するポケモンのうち、データとして未登録のものがあります（例: 一部の伝説・地域フォルム等）。順次対応予定。
- **型推定は未対応**: 相手の型（性格・持ち物・SP 配分）は明示指定するか、複数型を試行して検証する形になります。
- **メタゲーム情報は持ちません**: 使用率・流行型等の統計データは扱わないため、AI クライアント側の知識と組み合わせたり、WEB検索をさせて利用してください。

## 開発者向け

開発・コントリビュート方法・データ編集指針は [`CLAUDE.md`](./CLAUDE.md) を参照してください。

### コントリビュート

- バグ修正・機能追加の PR 大歓迎です
- データの追加・修正も歓迎します

### リリース手順（メンテナ向け）

GitHub Release の作成で npm publish が自動実行されます
(`.github/workflows/publish.yml`)。

#### 初回セットアップ（一度だけ）

本プロジェクトは
[Trusted Publisher (OIDC)](https://docs.npmjs.com/trusted-publishers/)
で認証するため long-lived な token は保持しません。ただし Trusted Publisher は
「既に 1 バージョン以上 publish 済みのパッケージ」にしか設定できないため、
初回のみ手動で publish する必要があります。

1. **ローカルで初回 publish を実施**（一度だけ）:

   ```bash
   npm login           # 2FA 有効な npm アカウントで
   npm publish --workspace=ai-rotom --access public --provenance
   ```

2. **npm で Trusted Publisher を設定**:
   - npmjs.com → `ai-rotom` パッケージ → Settings → Trusted Publishers → Add
   - Publisher: **GitHub Actions**
   - Organization or user: `nonz250`
   - Repository: `ai-rotom`
   - Workflow filename: `publish.yml`
   - Environment name: `production`

3. **GitHub 側のセキュリティ設定**（後述）を行う。

以降の publish は GitHub Release を作成するだけで自動実行されます
（NPM_TOKEN の Secrets 登録は不要）。

#### リリース毎の手順

1. `packages/mcp-server/package.json` の `version` を更新してコミット
   （main ブランチへ merge）
2. GitHub で新規 Release を作成。タグ名は `vX.Y.Z`
   （例: `v0.1.0`。`v` プレフィクス必須、package.json の version と一致）
3. Release を publish すると自動で npm に公開される

#### 自動で実行される検証

- タグ名と `package.json` の version の一致チェック
- テスト・型チェック・ビルド
- 同一 version が既に公開済みなら skip（エラーではなく安全停止）
- npm provenance による署名（GitHub Actions からの公開を証明）
- `workflow_dispatch` 手動実行は `main` ブランチからのみ許可

#### GitHub 側のセキュリティ設定

publish workflow のセキュリティを高めるため、以下を設定してください:

- **Settings → Environments → `production`** を作成
  - Required reviewers に自分を登録（Release published 後、approve するまで publish されない保険）
  - Deployment branches を `main` のみに制限
  - Trusted Publisher 使用のためシークレットの登録は不要
- **Settings → Actions → General**
  - Workflow permissions: "Read repository contents and packages permissions"
  - Fork PR workflows: 最低限 "Require approval for first-time contributors"
- **Settings → Branches → Branch protection (main)**
  - PR 必須 + CI (`quality`) を required status check に
- **Settings → Tags → Tag protection rule**
  - `v*` パターンを protect し、作成権限を admin のみに制限

## トラブルシューティング

### 入力エラー: 「ポケモン「XXX」が見つかりません」

- 日本語名の表記ゆれ（半角/全角）が原因の可能性があります
- エラーメッセージに表示される類似候補を参考にしてください
- フォルム違い（例: メガリザードンX / Y）は正式名称で指定してください

### 「能力ポイント(SP)は各ステータス 32 以下です」

- 従来の EV（252 等）を渡していないか確認してください
- ポケモンチャンピオンズ仕様では **各ステ 0-32 / 合計 0-66** です
