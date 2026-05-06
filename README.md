# ai-rotom-agent (CLI 統合版)

Pokémon Champions (Lv50 / SP 制) 向け対戦アシスタント。
ダメージ計算・メタ調査・構築支援・対面分析・主張機械検証を **CLI + AI クライアント** で行う。

これは [ai-rotom](https://github.com/nonz250/ai-rotom) (TypeScript MCP サーバー) のフォーク。
MCP サーバーとしての動作はそのまま維持しつつ、**champs CLI** として直接サブコマンドを叩ける形に拡張し、
pokedb.tokyo の環境採用率取得・累積判定ダメ計・主張機械検証などのフォーク独自ツールを追加している。
Claude Desktop / Claude Code / Gemini CLI すべてで動作する。

---

## 著作権・商標

本プロジェクトはポケモンの **ファンメイドツール** です。
**ポケモンに関する著作権・商標権はすべて権利者に帰属します。**

- © Nintendo / Creatures Inc. / GAME FREAK Inc.
- © Pokémon.
- 「ポケットモンスター」「ポケモン」「Pokémon」および関連する名称・ロゴは、任天堂株式会社、株式会社クリーチャーズ、株式会社ゲームフリーク、株式会社ポケモンの商標または登録商標です。
- 「ポケモンチャンピオンズ」および本ツールが対象とするゲームタイトルは上記権利者の著作物です。

### 本プロジェクトの位置付け

- 本プロジェクトは **ファンメイド作品** であり、ポケモンの **公式商品ではありません**。
- 任天堂株式会社、株式会社ポケモン、株式会社クリーチャーズ、株式会社ゲームフリークは、本プロジェクトに関与していません。
- 本プロジェクトは対戦研究・個人利用を目的としており、**商用を目的とするものではありません**。

### ライセンスと権利尊重について

本プロジェクトのソースコードは下記「ライセンス」セクションのとおり MIT License で配布されますが、**利用・改変・再配布に際してはポケモンに関する著作権・商標権を最大限尊重してください**。

具体的には以下の行為を避けてください:

- ポケモンの公式ツール・公式サービスであるかのように誤認させる表示
- ポケモン関連の著作物 (ゲーム画像・音声・ロゴ等) を権利者の許諾なく本プロジェクトに同梱すること
- 権利者の利益を損なう形での商用利用

権利者から連絡をいただいた場合は、速やかに対応します。

## ライセンス

本プロジェクトのソースコードは [MIT License](./LICENSE) で提供されます。
ただし前述のとおり、ポケモンに関する権利は MIT License の対象ではなく、各権利者に帰属します。

---

## クイックスタート

### 前提
- Node.js >= 24

### ビルド

```bash
git clone <このリポジトリ>
cd ai-rotom-agent
npm install
npm run build
```

`packages/mcp-server/dist/index.mjs` が生成され、CLI / MCP どちらのモードでも使える。

### 使い方 (4 通り)

| 環境 | 使い方 |
|---|---|
| **Claude Desktop (Project)** | `system_prompt.md` を `Add content from GitHub` で読み込ませる。Code Execution で `node /path/to/dist/index.mjs <subcommand> ...` を呼ぶ |
| **Claude Desktop (MCP)** | `claude_desktop_config.json` の `mcpServers` に登録、引数なし起動で Stdio MCP モード |
| **Claude Code / Codex** | `claude mcp add ai-rotom -- node /path/to/dist/index.mjs` または `npm install -g` 後 `champs <subcommand>` |
| **Gemini CLI / ローカル CLI** | `node packages/mcp-server/dist/index.mjs <subcommand> ...` または bin にリンクして `champs <subcommand> ...` |

`champs` と `ai-rotom` は同一バイナリの別名。引数の有無で CLI / MCP モードが自動切り替え。

---

## 主要サブコマンド

```bash
# ポケモン情報
champs describe <ポケモン名>      # = get_pokemon_summary
champs move <技名>                # = get_move_info
champs ability <特性名>           # = get_ability_info
champs item <道具名>              # = get_item_info
champs learnset <ポケモン名>      # = get_learnset

# 環境メタ (pokedb.tokyo)
champs top --n 50                 # = fetch_meta_top: 環境上位 N 体
champs typical --species <名前>   # = fetch_typical_set: 主流型サマリ
champs meta --species <名前>      # = fetch_pokemon_meta: 採用率データ
champs warm --depth 50            # = warm_meta_cache: キャッシュ事前取得

# ダメ計
champs calc <input.json>          # = calculate_damage_single
champs calc-protect <input.json>  # = calculate_damage_with_protection: 累積判定 (マルスケ/ばけ皮/タスキ)
champs realstat <input.json>      # = calculate_stats

# 分析
champs matchup <input.json>       # = analyze_matchup: 1 対 1
champs analyze <input.json>       # = analyze_party_vs_meta: 自パーティ vs 環境上位

# 検証
champs verify <input.json>        # = verify_claims: 9 種 claim の機械検証

# その他
champs --list                     # 全 31 ツール一覧
champs --help <tool>              # 個別ツールの引数
champs --mcp-server               # MCP Stdio モード
```

JSON は inline (`'{"key":"value"}'`) でもファイル (`./args.json`) でも、`--key value` フラグでも指定可。

---

## 苦手枠スキャン (`analyze_party_vs_meta`) の使い方

構築相談で最重要のツール。自パーティ vs 環境上位 N 体を総当たりで評価し、各環境ポケモンの主流型ごとに「50% 以上削れる打点が何個あるか」を計算して 危険 / 不利 / 有利 に分類する。マルスケ / ばけのかわ / タスキの累積判定込み、メガ複数なら ver 別に分割される。

### 入力フォーマット (構築の構造データ定義)

`party` 配列の各要素は以下のフォーマット:

```json
{
  "party": [
    {
      "name": "ポケモン名 (日本語 or 英語)",
      "nature": "性格名 (省略時 まじめ)",
      "ability": "特性名",
      "item": "持ち物名",
      "evs": { "hp": 0, "atk": 0, "def": 0, "spa": 0, "spd": 0, "spe": 0 },
      "moves": ["技1", "技2", "技3", "技4"]
    }
  ],
  "depth": 50,
  "threshold": 50
}
```

- `name`: 必須。ai-rotom データの日本語表記 (例: メガリザードンX) を使う。半角/全角・大文字/小文字は自動正規化されるので「メガリザードンＸ」「Charizard-mega-x」でも引ける。
- `evs`: 各ステ 0-32、合計 0-66 (Champions 仕様)。省略時は無振り 0。
- `moves`: 1〜4 個必須。ダメ計対象の打点になる。
- `depth`: 環境上位の調査範囲 (5-200, デフォルト 50)。pokedb.tokyo 採用率順。
- `threshold`: 「有効打点」と見なす最低ダメージ % (1-100, デフォルト 50)。

### 実行例: 6 体構築での苦手枠分析

入力 (`team.json` 等に保存):

```json
{
  "party": [
    {
      "name": "カバルドン", "item": "オボンのみ", "nature": "わんぱく", "ability": "すなおこし",
      "evs": {"hp": 32, "def": 15, "spd": 19},
      "moves": ["ふきとばし", "じしん", "ステルスロック", "あくび"]
    },
    {
      "name": "メガリザードンX", "item": "リザードナイトX", "nature": "ようき", "ability": "もうか",
      "evs": {"hp": 2, "atk": 32, "spe": 32},
      "moves": ["フレアドライブ", "りゅうのまい", "ドラゴンクロー", "かみなりパンチ"]
    },
    {
      "name": "キラフロル", "item": "きあいのタスキ", "nature": "おくびょう", "ability": "どくげしょう",
      "evs": {"hp": 2, "spa": 32, "spe": 32},
      "moves": ["キラースピン", "パワージェム", "だいちのちから", "ステルスロック"]
    },
    {
      "name": "メガルカリオ", "item": "ルカリオナイト", "nature": "おくびょう", "ability": "てきおうりょく",
      "evs": {"hp": 2, "spa": 32, "spe": 32},
      "moves": ["はどうだん", "ラスターカノン", "わるだくみ", "しんくうは"]
    },
    {
      "name": "ミミッキュ", "item": "のろいのおふだ", "nature": "いじっぱり", "ability": "ばけのかわ",
      "evs": {"hp": 31, "atk": 32, "spe": 3},
      "moves": ["じゃれつく", "かげうち", "つるぎのまい", "シャドークロー"]
    },
    {
      "name": "アシレーヌ", "item": "しんぴのしずく", "nature": "れいせい", "ability": "げきりゅう",
      "evs": {"hp": 32, "def": 14, "spa": 20},
      "moves": ["うたかたのアリア", "ムーンフォース", "くろいきり", "アクアジェット"]
    }
  ],
  "depth": 30,
  "threshold": 50
}
```

実行:

```bash
champs warm --depth 30          # まずキャッシュをウォーム (~1 秒)
champs analyze ./team.json      # 苦手枠分析
```

### 出力例 (上記構築 vs 環境上位 30 体)

```jsonc
{
  "mode": "multi-mega",
  "summary": {
    "depth": 30,
    "threshold": 50,
    "megaVersions": ["メガリザードンX", "メガルカリオ"],
    "structuralDanger": 3,        // 両 ver で詰む = 構造的詰み
    "megaDependentDanger": 2      // 片メガでしか詰まない = メガ選択でカバー可能
  },
  "structuralDanger": [
    {
      "rank": 29, "name": "フシギバナ", "variant": "おだやか 46.7%",
      "defenderUsed": { "name": "メガフシギバナ", "ability": "あついしぼう", "item": "フシギバナイト", "isMega": true },
      "topAttempts": [
        { "poke": "メガリザードンX", "move": "フレアドライブ", "range": "46.0-55.6%" },
        { "poke": "キラフロル", "move": "パワージェム", "range": "28.9-34.2%" }
      ],
      "opponentThreats": [
        { "attackerMove": "だいちのちから", "defender": "キラフロル", "range": "120.0-142.5%", "accumulatedKO": "確定2発" }
      ]
    }
    /* ... 残り 2 件 (フシギバナ ひかえめ 25.5% / ずぶとい 24.3%) ... */
  ],
  "megaDependentDanger": [
    {
      "rank": 22, "name": "ガルーラ", "variant": "いじっぱり 90.2%",
      "dangerInVersions": ["メガリザードンX"],
      "defenderUsed": { "name": "メガガルーラ", "ability": "おやこあい", "isMega": true }
    },
    {
      "rank": 2, "name": "アシレーヌ", "variant": "ひかえめ 69.3%",
      "dangerInVersions": ["メガルカリオ"]
    }
  ]
}
```

### 結果の考察 (この構築の場合)

**構造的詰み (両メガで詰む)**:
- **フシギバナ 3 主流型 (合計シェア 96.5%)** がすべて両 ver で詰み判定。仮想敵 メガフシギバナの特性「あついしぼう」で炎・氷・鋼ダメージが半減され、メガリザードンXのフレアドライブが 46-55% (確 3 圏外) に止まる。一方フシギバナの「だいちのちから」はキラフロル (Steel/Poison 4 倍弱点) を確定 2 発で持っていく。明確な構造的弱点。

**メガ依存詰み (メガ選択でカバー可能)**:
- メガガルーラ (90.2% 採用率): メガリザードンX 選出時のみ詰み → メガルカリオ選出側で対処
- アシレーヌ (69.3% 採用率): メガルカリオ選出時のみ詰み → メガリザードンX選出側で対処

**総評**: メガ補完はよく効いた構築だが、**フシギバナへの抜け道がない** ことが最大の課題。アシレーヌのうたかたのアリアを「フリーズドライ」(Ice 技、メガフシギバナ 4 倍弱点) に変えるなどの調整余地がある (要 verify_claims で再検証)。

---

## ファイル構成

| ファイル | 説明 |
|---|---|
| `system_prompt.md` | AI クライアントへのシステムプロンプト (v2.0) |
| `packages/mcp-server/` | TypeScript MCP サーバー / CLI 本体 |
| `packages/mcp-server/src/cli/` | CliMcpAdapter + champs dispatcher (フォーク独自) |
| `packages/mcp-server/src/services/` | pokedb.tokyo クライアント・キャッシュ・累積判定・タイプラベル等の共通層 (フォーク独自) |
| `packages/mcp-server/src/tools/` | 全ツール群 (24 個は ai-rotom 由来、7 個はフォーク独自追加) |
| `shared/` | ロジック共通基盤 (ダメ計・タイプ相性・ステ計算) |
| `data/champions/` | Champions データ (ポケモン・技・特性・道具・性格・タイプ・状態・learnset) |

---

## ai-rotom 上流からの差分

このフォークは ai-rotom 上流の更新を `git pull` で素直にマージできるよう設計されている:

- 既存 24 ツールの `register*Tool` ファイルは **完全無修正**
- 追加 7 ツール (`fetch_meta_top` / `fetch_pokemon_meta` / `fetch_typical_set` / `warm_meta_cache` / `verify_claims` / `analyze_party_vs_meta` / `calculate_damage_with_protection`) は新規ファイルのみ
- 触る既存ファイルは `server.ts` (新ツール 7 個の登録末尾追記) / `index.ts` (CLI モード分岐) / `instructions.ts` (Champions 新環境向けセクション追加) / `shared/utils/name-resolver.ts` (半角全角正規化レイヤー追加) のみ
- McpServer のモック shim (`cli/adapter.ts`) を経由するので、既存ツールは MCP transport なしで CLI からも呼べる

---

## 既知の制限

- **一部ポケモン未登録**: ゲーム本編に登場するポケモンのうち、データとして未登録のものがあります (例: 一部の伝説・地域フォルム等)。順次対応予定。
- **メタデータ取得には pokedb.tokyo が必要**: `fetch_meta_top` 等は外部 HTTP に接続するため、オフライン環境では動作しません。キャッシュ済みなら 24h は再利用される (`~/.cache/ai-rotom/`)。

---

## 開発者向け

```bash
npm test                # vitest (531+ tests)
npm run test:dist       # dist 経由スモークテスト
npm run build           # tsdown でバンドル
```

データ編集指針は [CLAUDE.md](./CLAUDE.md) (ai-rotom 上流のドキュメント) を参照。

### トラブルシューティング

#### 「ポケモン「XXX」が見つかりません」
- 半角/全角・大文字/小文字は自動正規化されますが、フォルム違いは正式名称で指定してください (例: `メガリザードンX`)
- エラーメッセージ内の類似候補を参照

#### 「能力ポイント (SP) は各ステ 32 以下」
- 従来の EV (252) ではなく Champions 仕様 (各ステ 0-32 / 合計 0-66) で指定
