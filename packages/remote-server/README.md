# ai-rotom リモート MCP サーバー

Muse のカスタムコネクタのように、手元で MCP サーバーを起動できないクライアントから使うための、Cloudflare Workers 版の ai-rotom です。このパッケージは、ai-rotom のリモート MCP サーバーを自分の Cloudflare アカウントにデプロイするためのものです。リポジトリを clone してデプロイします。コマンドは、特に断りがなければリポジトリのルートで実行します。公開している ai-rotom のリモート MCP サーバーにつなぐだけなら、ルートの [README](../../README.md#クイックスタート) を参照してください。

## デプロイ手順

```bash
npm ci
cd packages/remote-server
npx wrangler login
openssl rand -hex 32            # 認証トークンを作る
npx wrangler secret put AUTH_TOKEN   # 作ったトークンを貼り付ける
npm run deploy
```

デプロイ後は `https://ai-rotom.<サブドメイン>.workers.dev/mcp` を MCP サーバーの URL として登録し、`Authorization: Bearer <トークン>` ヘッダーを付けて呼びます。ヘッダーを設定できないクライアントでは `https://ai-rotom.<サブドメイン>.workers.dev/mcp/<トークン>` も使えます。この形はトークンが URL に含まれ、アクセスログなどに残るので、ヘッダーを使えるならそちらを選んでください。

## リモート版の制約

- `save_party` などのパーティ保存系のツールは使えません。パーティは分析ツールに毎回引数で渡します
- ブラウザから直接つなぐクライアントには対応していません。`Origin` ヘッダーが付いたリクエストは、値によらず 403 で拒否します。サーバー側で動く MCP クライアントは `Origin` を付けないので、そのままつなげます
- Workers の無料プランは 1 リクエストあたりの CPU 時間が 10 ms までです。そのためリモート版では、全技ダメ計・6v6 ダメ計・対面分析・選出分析で、自分側のポケモンの技構成の指定が必須です。指定しないとエラーを返します。相手側の技構成は必須ではありません。AI クライアントには技構成を指定して呼ぶよう案内します
- 技構成を必須にするかは `packages/remote-server/wrangler.toml` の `REQUIRE_MOVES` で切り替えられます。有料プランなど CPU 時間に余裕がある環境では `"false"` にすると、stdio 版と同じく技構成を省略できます。ダッシュボードで変えた値はデプロイのたびに `wrangler.toml` の値で上書きされるので、このファイルで変えてください
- 対応する MCP のプロトコルの版は、同梱している MCP SDK が扱う版に従います。複数のメッセージを配列でまとめて送るバッチには対応していません
- リクエストは、認証ありならトークンごと、認証なしなら接続元のアドレスごとに、60 秒あたり 60 件までです。超えると 429 を返します。上限は `packages/remote-server/wrangler.toml` の `[[ratelimits]]` の `limit` で変えられます。数え方は Cloudflare のロケーションごとの近似なので、上限を少し超えて通ることがあります

## トークンの扱い

- トークンは `openssl rand -hex 32` などで作った、32 文字以上のランダムな値にしてください。32 文字に満たないトークンでは、すべてのリクエストを 503 で拒否します。ローカルでの確認に使ったトークンを本番に流用しないでください
- トークンを入れ替えるときは、`npx wrangler secret put AUTH_TOKEN` で新しい値を設定し、登録しているクライアントのヘッダーや URL も新しい値に書き換えます
- `/mcp/<トークン>` の URL は、トークンと同じく秘密の値として扱ってください。Workers Logs や `wrangler tail` を有効にしていると、リクエストの URL がログに残ります。ログを見られる人と保存の設定を確かめてください

## 認証なしで公開する

`ALLOW_ANONYMOUS` を `true` にすると、トークンを確かめずにすべてのリクエストを受け付けます。公開している ai-rotom の公式サーバーはこの設定で動かしています。値は前後の空白を除き、大文字と小文字を区別せずに比べます。文字列の `"true"` でも真偽値の `true` でも同じです。それ以外の値や未設定のときは、今までどおり `AUTH_TOKEN` で認証します。

```bash
npm run deploy -- --var ALLOW_ANONYMOUS:true   # packages/remote-server で実行する
```

- リクエスト数の上限は、トークンごとではなく接続元の IP アドレスごとに数えます。IPv6 は先頭 64 ビットが同じアドレスをまとめて数えます
- パスにトークンを入れる `/mcp/<トークン>` の URL は 404 を返します。`/mcp` につないでください
- だれでも呼べるので、無料プランの 1 日あたりのリクエスト数を使い切られることがあります。下の「受け入れているリスク」も確かめてください

`wrangler.toml` の `[vars]` に書くこともできますが、手違いで公開しないよう、デプロイのコマンドで渡すことをすすめます。

## 受け付けるホスト名を絞る

`packages/remote-server/wrangler.toml` の `[vars]` に `ALLOWED_HOSTS` をカンマ区切りで書くと、それ以外のホスト名で届いたリクエストを 403 で拒否します。ポートは書かず、ホスト名だけを並べます。未設定のときはホスト名を確かめません。

```toml
ALLOWED_HOSTS = "ai-rotom.<サブドメイン>.workers.dev"
```

ダッシュボードで設定した値はデプロイのたびに消えるので、`wrangler.toml` に書いてください。`wrangler.toml` に書いたまま手元で確かめるときは、`npx wrangler dev --var ALLOWED_HOSTS:localhost` のように手元のホスト名で上書きします。

## 受け入れているリスク

リモート版は、次のリスクを承知したうえで対策を入れていません。公開する前に、自分の使い方で問題にならないか確かめてください。

- すべてのクライアントで 1 つの `AUTH_TOKEN` を共有します。漏れても、呼べるのは公開されているポケモンのデータを読んで計算するだけのツールです。そのため、クライアントごとのトークンや OAuth は実装していません
- ChatGPT の Web 版のようにヘッダーを設定できないクライアントのために、パスにトークンを入れた URL を受け付けています。この URL はクライアントの設定や Cloudflare のログに残りえますが、同じ理由で受け入れています。漏れたおそれがあれば、トークンを入れ替えてください
- 認証を通らないリクエストも、Workers の無料プランの 1 日あたりのリクエスト数に数えられます。この上限は Worker ごとではなくアカウント全体にかかります。無料プランでは上限を超えても料金はかかりませんが、UTC の 0 時に戻るまで、リモート版だけでなく同じアカウントで動かしている他の Worker も使えなくなります。他の Worker を巻き込みたくなければ、リモート版は専用のアカウントにデプロイしてください。防ぐには、独自ドメインを割り当てて WAF のレート制限をかけたうえで、`packages/remote-server/wrangler.toml` に `workers_dev = false` と `preview_urls = false` を書いて、workers.dev のアドレスと Version URL を閉じる必要があります。WAF のルールは独自ドメインのゾーンにしか効かないので、workers.dev のアドレスや Version URL に届いたリクエストは WAF を通らずに数えられます

## ローカルで動作確認する

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

## Cloudflare 以外のサービスで動かす

リモート版の本体は、`packages/remote-server/src/handler.ts` の `createRequestHandler` にまとめていて、実行環境に依存しません。Cloudflare Workers 用のエントリは、その上に置いた薄いアダプターです。

ほかのサービスで動かすときは `packages/remote-server/src/platforms/` にエントリを足し、サービスの環境変数を `loadConfig` に渡して得た設定で `createRequestHandler` を呼びます。Web 標準の `Request` を受けて `Response` を返す形のサービスなら、この方法で動かせます。動作を確かめているのは、今のところ Cloudflare Workers だけです。

ほかのサービスに移すときは、次の点も確かめてください。

- TLS で受けてください。ハンドラーはリクエストの URL が http なら拒否するので、手前で TLS を外す構成でも、クライアントから見た https の URL をハンドラーに渡します
- ハンドラーも本文を 64 KiB までに制限しますが、本文の大きさの上限は手前のサービスやプロキシでもかけてください
- 受け付けるホスト名は `ALLOWED_HOSTS` で絞れます。ハンドラーはリクエストの URL のホスト名で比べるので、手前のサービスやプロキシは、クライアントがつないだホスト名を URL に入れて渡してください
- 認証なしで、リクエスト数の制限も使うときは、接続元のアドレスを返す関数を `createRequestHandler` の 3 つ目の引数に渡してください。渡さないと、アドレスがわからないので、すべてのリクエストを 503 で拒否します
