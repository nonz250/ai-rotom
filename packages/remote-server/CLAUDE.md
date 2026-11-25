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
- `tsconfig.json` は Node の型を読まず、`WebWorker` の lib だけで型検査する。`Buffer` や `process` など Workers にないグローバルを型検査で弾くためで、`types: ["node"]` を足さない

## 制約

- リクエストごとにサーバーとトランスポートを作り直すステートレス構成。セッションを持たないので GET (SSE) と DELETE は 405 を返す
- `nodejs_compat` を有効にしていないので、core から辿れるコードで Node の組み込みモジュールを import すると Workers で動かない。wrangler はこれを外部参照のままバンドルしてしまうため、CI の `scripts/verify-worker-bundle.sh` で検出する。`nodejs_compat` を有効にして回避しない。保存系が core に混ざったことに気付けなくなる
- `scripts/verify-worker-bundle.sh` はこの不変条件が崩れていないかを見る回帰チェックで、セキュリティの境界ではない。見ているのは `node:` の import だけで、任意の通信やデータの持ち出しなど悪意あるコードは検出しない。wrangler はこの崩れを見逃して失敗しないので外さない
- 無料プランの CPU 上限は 1 リクエスト 10 ms。データの Map 構築はモジュール読み込み時に 1 回だけ行い、リクエストごとに作らない
- 習得技すべての計算は 10 ms を超えるので、既定では `requireMoves` で全技系ツールの自分側に moves を必須にしている。環境変数 `REQUIRE_MOVES` が `"false"` のときだけ任意にする。未設定や読み違えで必須が外れると無料プランで失敗するため、既定は必須にする。相手側は必須にしない。技構成がわからない相手の型を AI に作らせることになるため。instructions で案内するだけでは AI クライアントが従わなかったため、ツール側でエラーにする
