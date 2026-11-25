# packages/remote-server/

mcp-server の core（パーティ保存系を除くツール）をリモート MCP サーバーとして動かす。既定のデプロイ先は Cloudflare Workers。npm には公開しない。

## 構成

| ファイル | 役割 |
|---|---|
| `src/handler.ts` | 認証・ルーティング・MCP の処理。Web 標準の `Request` / `Response` だけを使う |
| `src/config.ts` | 環境変数の集まりから設定を読む |
| `src/platforms/<サービス>.ts` | サービスごとのエントリ。環境変数の受け取り方の違いだけを吸収する |

サービス固有の API や型は `platforms/` の外に持ち込まない。handler と config に入れると、他のサービスで動かすときに作り直しになる。

- mcp-server から使うのは `@ai-rotom/mcp-core` に出したものだけにする
- 認証は環境変数 `AUTH_TOKEN` との照合。Cloudflare では wrangler secret で設定する。未設定なら全リクエストを拒否する
- `AUTH_TOKEN` が 32 文字に満たなければ未設定と同じく拒否する。共有トークン 1 つで守っているので、推測できる短い値で公開されるよりは止める
- トークンは SHA-256 のダイジェスト同士で比べる。長さの違いで早く返すと応答時間から長さが漏れるため。Workers の `crypto.subtle.timingSafeEqual` は他のサービスにないので使わない
- 認証を通ったら、`authorization` ヘッダーを除きパスを `/mcp` に戻したリクエストを SDK に渡す。SDK は URL とヘッダーをツールの処理まで渡すので、トークンをそこへ広げない
- リクエスト数の制限は、認証を通ったあとにだけかける。認証前に数えると、でたらめなトークンを送るたびに別のキーができて制限として働かない。認証前のリクエストが枠を消費することは受け入れている
- 制限のキーはトークンの SHA-256 ダイジェストの先頭から作り、トークンそのものを含めない。キーは制限の仕組みの側に保存されるため
- 制限の実体はハンドラーの `RateLimiter` として `platforms/` から渡す。Cloudflare では Rate Limiting バインディング `RATE_LIMITER` を使う。バインディングは数え直すまでの秒数を返さないので、`wrangler.toml` の `period` を変えたら `cloudflare.ts` の `RATE_LIMIT_PERIOD_SECONDS` も合わせる
- `Origin` ヘッダーが付いたリクエストは、値によらず認証より前に 403 で拒否する。ブラウザには対応しないので、許可する Origin の設定は持たない。`Origin: null` も拒否する
- 環境変数 `ALLOWED_HOSTS` を設定したときだけ、受け付けるホスト名を認証より前に確かめる。未設定や、ホスト名が 1 つも残らない値なら確かめない。workers.dev のサブドメインはアカウントごとに違い、既定値を置けないため
- ホスト名は `Host` ヘッダーではなく `new URL(request.url).hostname` で比べる。手前で TLS を外すプロキシの後ろでは `Host` が内側の名前になりうるので、https の確認と同じく、クライアントから見た URL を渡してもらう前提にそろえる。ポートは比べない
- 本文はハンドラーで読み、配列で届く JSON-RPC のバッチを 400 で拒否してから、パース済みの値を SDK に渡す。バッチは 1 リクエストで最大 100 件を処理させられ、1 回の CPU 時間の上限と噛み合わない。パース済みの値を渡すと SDK の `maxRequestBodySize` は効かないので、本文の上限はハンドラーで確かめる
- `tsconfig.json` は Node の型を読まず、`WebWorker` の lib だけで型検査する。`Buffer` や `process` など Workers にないグローバルを型検査で弾くためで、`types: ["node"]` を足さない

## 制約

- リクエストごとにサーバーとトランスポートを作り直すステートレス構成。セッションを持たないので GET (SSE) と DELETE は 405 を返す
- `nodejs_compat` を有効にしていないので、core から辿れるコードで Node の組み込みモジュールを import すると Workers で動かない。wrangler はこれを外部参照のままバンドルしてしまうため、CI の `scripts/verify-worker-bundle.sh` で検出する。`nodejs_compat` を有効にして回避しない。保存系が core に混ざったことに気付けなくなる
- `scripts/verify-worker-bundle.sh` はこの不変条件が崩れていないかを見る回帰チェックで、セキュリティの境界ではない。見ているのは `node:` の import だけで、任意の通信やデータの持ち出しなど悪意あるコードは検出しない。wrangler はこの崩れを見逃して失敗しないので外さない
- 無料プランの CPU 上限は 1 リクエスト 10 ms。データの Map 構築はモジュール読み込み時に 1 回だけ行い、リクエストごとに作らない
- 習得技すべての計算は 10 ms を超えるので、既定では `requireMoves` で全技系ツールの自分側に moves を必須にしている。環境変数 `REQUIRE_MOVES` が `"false"` のときだけ任意にする。未設定や読み違えで必須が外れると無料プランで失敗するため、既定は必須にする。相手側は必須にしない。技構成がわからない相手の型を AI に作らせることになるため。instructions で案内するだけでは AI クライアントが従わなかったため、ツール側でエラーにする
