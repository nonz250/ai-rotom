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
npx -y @nonz250/ai-rotom
```

標準入出力で MCP プロトコルが動くため、実運用は下記の MCP クライアント経由で行います。

## MCP クライアント設定

### Claude Code

プロジェクトまたはユーザー設定に追加。

```bash
claude mcp add ai-rotom -- npx -y @nonz250/ai-rotom
```

### Codex

プロジェクトまたはユーザー設定に追加。

```bash
codex mcp add ai-rotom -- npx -y @nonz250/ai-rotom
```

### リモート MCP サーバーとして公開する (Cloudflare Workers)

Muse のカスタムコネクタのように手元で MCP サーバーを起動できないクライアントからは、Cloudflare Workers に置いたリモート MCP サーバーとしてつなげます。リポジトリを clone して、自分の Cloudflare アカウントにデプロイします。

```bash
npm ci
cd packages/remote-server
npx wrangler login
openssl rand -hex 32            # 認証トークンを作る
npx wrangler secret put AUTH_TOKEN   # 作ったトークンを貼り付ける
npm run deploy
```

デプロイ後は `https://ai-rotom.<サブドメイン>.workers.dev/mcp` を MCP サーバーの URL として登録し、`Authorization: Bearer <トークン>` ヘッダーを付けて呼びます。ヘッダーを設定できないクライアントでは `https://ai-rotom.<サブドメイン>.workers.dev/mcp/<トークン>` も使えます。この形はトークンが URL に含まれ、アクセスログなどに残るので、ヘッダーを使えるならそちらを選んでください。

リモート版には次の制約があります。

- `save_party` などのパーティ保存系のツールは使えません。パーティは分析ツールに毎回引数で渡します
- ブラウザから直接つなぐクライアントには対応していません。`Origin` ヘッダーが付いたリクエストは、値によらず 403 で拒否します。サーバー側で動く MCP クライアントは `Origin` を付けないので、そのままつなげます
- Workers の無料プランは 1 リクエストあたりの CPU 時間が 10 ms までです。そのためリモート版では、全技ダメ計・6v6 ダメ計・対面分析・選出分析で、自分側のポケモンの技構成の指定が必須です。指定しないとエラーを返します。相手側の技構成は必須ではありません。AI クライアントには技構成を指定して呼ぶよう案内します
- 技構成を必須にするかは `packages/remote-server/wrangler.toml` の `REQUIRE_MOVES` で切り替えられます。有料プランなど CPU 時間に余裕がある環境では `"false"` にすると、stdio 版と同じく技構成を省略できます。ダッシュボードで変えた値はデプロイのたびに `wrangler.toml` の値で上書きされるので、このファイルで変えてください
- 対応する MCP のプロトコルの版は、同梱している MCP SDK が扱う版に従います。複数のメッセージを配列でまとめて送るバッチには対応していません
- 認証を通ったリクエストは、トークンごとに 60 秒あたり 60 件までです。超えると 429 を返します。上限は `packages/remote-server/wrangler.toml` の `[[ratelimits]]` の `limit` で変えられます。数え方は Cloudflare のロケーションごとの近似なので、上限を少し超えて通ることがあります

#### 受け付けるホスト名を絞る

`packages/remote-server/wrangler.toml` の `[vars]` に `ALLOWED_HOSTS` をカンマ区切りで書くと、それ以外のホスト名で届いたリクエストを 403 で拒否します。ポートは書かず、ホスト名だけを並べます。未設定のときはホスト名を確かめません。

```toml
ALLOWED_HOSTS = "ai-rotom.<サブドメイン>.workers.dev"
```

ダッシュボードで設定した値はデプロイのたびに消えるので、`wrangler.toml` に書いてください。`wrangler.toml` に書いたまま手元で確かめるときは、`npx wrangler dev --var ALLOWED_HOSTS:localhost` のように手元のホスト名で上書きします。

#### トークンの扱い

- トークンは `openssl rand -hex 32` などで作った、32 文字以上のランダムな値にしてください。32 文字に満たないトークンでは、すべてのリクエストを 503 で拒否します。ローカルでの確認に使ったトークンを本番に流用しないでください
- トークンを入れ替えるときは、`npx wrangler secret put AUTH_TOKEN` で新しい値を設定し、登録しているクライアントのヘッダーや URL も新しい値に書き換えます
- `/mcp/<トークン>` の URL は、トークンと同じく秘密の値として扱ってください。Workers Logs や `wrangler tail` を有効にしていると、リクエストの URL がログに残ります。ログを見られる人と保存の設定を確かめてください

#### ローカルで動作確認する

デプロイ前に、手元の Workers ランタイムでリモート版を起動して MCP クライアントからつなげます。

```bash
cp packages/remote-server/.dev.vars.example packages/remote-server/.dev.vars
openssl rand -hex 32    # 出力を .dev.vars の AUTH_TOKEN= の後ろに貼り付ける
npm run worker:dev      # http://localhost:8787/mcp で待ち受ける
```

`AUTH_TOKEN` が空のときや 32 文字に満たないときは、すべてのリクエストを 503 で拒否します。

別のターミナルで Claude Code に登録します。トークンは `.dev.vars` の `AUTH_TOKEN` です。

```bash
claude mcp add --transport http ai-rotom-local http://localhost:8787/mcp \
  --header "Authorization: Bearer <.dev.vars の AUTH_TOKEN>"
```

確認が終わったら `claude mcp remove ai-rotom-local` で外します。

リモート版は、`localhost` などの手元のホスト以外から http で届いたリクエストを 403 で拒否します。手元の Workers ランタイムをトンネルなどで外に公開するときは、`npx wrangler dev --local-protocol https` で起動して https で転送し、本番と同じくランダムなトークンを使ってください。

#### Cloudflare 以外のサービスで動かす

リモート版の本体は、`packages/remote-server/src/handler.ts` の `createRequestHandler` にまとめていて、実行環境に依存しません。Cloudflare Workers 用のエントリは、その上に置いた薄いアダプターです。

ほかのサービスで動かすときは `packages/remote-server/src/platforms/` にエントリを足し、サービスの環境変数を `loadConfig` に渡して得た設定で `createRequestHandler` を呼びます。Web 標準の `Request` を受けて `Response` を返す形のサービスなら、この方法で動かせます。動作を確かめているのは、今のところ Cloudflare Workers だけです。

ほかのサービスに移すときは、次の点も確かめてください。

- TLS で受けてください。ハンドラーはリクエストの URL が http なら拒否するので、手前で TLS を外す構成でも、クライアントから見た https の URL をハンドラーに渡します
- ハンドラーも本文を 64 KiB までに制限しますが、本文の大きさの上限は手前のサービスやプロキシでもかけてください
- 受け付けるホスト名は `ALLOWED_HOSTS` で絞れます。ハンドラーはリクエストの URL のホスト名で比べるので、手前のサービスやプロキシは、クライアントがつないだホスト名を URL に入れて渡してください

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

### パーティ永続化

自分のパーティ構築を `~/.ai-rotom/parties.json` に保存し、セッションをまたいで再利用できる。

| ツール | 概要 |
|---|---|
| `save_party` | パーティを保存 (同名は上書き) |
| `load_party` | 保存済みパーティを 1 件取得 |
| `list_parties` | 保存済みパーティのサマリ一覧 |
| `delete_party` | 保存済みパーティを削除 |

## 使用例

AI クライアントに以下のように聞くと、内部でツールが自動で呼ばれます。

> 「カバルドンの対策候補を教えて」

e.g.) `search_pokemon_by_type_effectiveness` でカバルドンの弱点タイプ（みず/くさ/こおり）の攻撃技を覚えるポケモンが検索され、AI が選んだ候補ごとに `analyze_matchup` で双方向のダメ計・素早さ比較・先制技が取得されます。受け型か速攻型かといった対策方針の判断は AI が行います。必要に応じてカバルドンの技構成や行動をプロンプトに入力し、あくび受けループに対する対策の検討をしてください。

> 「リザードン、ギャラドス、ピカチュウの 3 体パーティに足りないタイプ耐性は？」

e.g.) `analyze_party_weakness` が呼ばれ、各タイプを弱点に持つメンバー数（`teamWeaknesses`）と抜群を取れないタイプ（`uncoveredTypes`）を返します。致命性の判断は AI が文脈で行います。

## 既知の制限

- **一部ポケモン未登録**: ゲーム本編に登場するポケモンのうち、データとして未登録のものがあります（例: 一部の伝説・地域フォルム等）。順次対応予定。
- **一部の特性はダメージ計算に反映されません**: 計算エンジンが未対応の特性があり、効果がダメージ計算結果に含まれません。get_ability_info で効果を確認したうえで結果を解釈してください。
- **一部の持ち物はダメージ計算に反映されません**: 計算エンジンが未対応の持ち物があります。get_item_info で効果を確認したうえで結果を解釈してください。
- **型推定は未対応**: 相手の型（性格・持ち物・SP 配分）は明示指定するか、複数型を試行して検証する形になります。
- **メタゲーム情報は持ちません**: 使用率・流行型等の統計データは扱わないため、AI クライアント側の知識と組み合わせたり、WEB検索をさせて利用してください。

## 開発者向け

開発・コントリビュート方法・データ編集指針は [`CLAUDE.md`](./CLAUDE.md) を参照してください。

### コントリビュート

- バグ修正・機能追加の PR 大歓迎です
- データの追加・修正も歓迎します

## トラブルシューティング

### 入力エラー: 「ポケモン「XXX」が見つかりません」

- 日本語名の表記ゆれ（半角/全角）が原因の可能性があります
- エラーメッセージに表示される類似候補を参考にしてください
- フォルム違い（例: メガリザードンX / Y）は正式名称で指定してください

### 「能力ポイント(SP)は各ステータス 32 以下です」

- 従来の EV（252 等）を渡していないか確認してください
- ポケモンチャンピオンズ仕様では **各ステ 0-32 / 合計 0-66** です
