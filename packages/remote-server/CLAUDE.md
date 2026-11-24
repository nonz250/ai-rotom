# packages/remote-server/

mcp-server の core（パーティ保存系を除くツール）を Cloudflare Workers でリモート MCP サーバーとして動かすエントリ。npm には公開しない。

- mcp-server から使うのは `@ai-rotom/mcp-core` に出したものだけにする
- 認証は wrangler secret の `AUTH_TOKEN` との照合。未設定なら全リクエストを拒否する
- `tsconfig.json` は Node の型を読まず、`WebWorker` の lib だけで型検査する。`Buffer` や `process` など Workers にないグローバルを型検査で弾くためで、`types: ["node"]` を足さない

## 制約

- リクエストごとにサーバーとトランスポートを作り直すステートレス構成。セッションを持たないので GET (SSE) と DELETE は 405 を返す
- `nodejs_compat` を有効にしていないので、core から辿れるコードで Node の組み込みモジュールを import すると Workers で動かない。wrangler はこれを外部参照のままバンドルしてしまうため、CI の `scripts/verify-worker-bundle.sh` で検出する。`nodejs_compat` を有効にして回避しない。保存系が core に混ざったことに気付けなくなる
- 無料プランの CPU 上限は 1 リクエスト 10 ms。データの Map 構築はモジュール読み込み時に 1 回だけ行い、リクエストごとに作らない
- 習得技すべての計算は 10 ms を超えるので、既定では `requireMoves` で全技系ツールの自分側に moves を必須にしている。環境変数 `REQUIRE_MOVES` が `"false"` のときだけ任意にする。未設定や読み違えで必須が外れると無料プランで失敗するため、既定は必須にする。相手側は必須にしない。技構成がわからない相手の型を AI に作らせることになるため。instructions で案内するだけでは AI クライアントが従わなかったため、ツール側でエラーにする
