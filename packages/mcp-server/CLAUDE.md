# packages/mcp-server/

npm で配布する stdio 版の MCP サーバー。shared のロジックに `data/champions/` のデータを注入して動かす。

## core とパーティ保存系を分ける

パーティ保存系のツール `tools/party/` は `server.ts` にだけ登録し、`core-server.ts` から import しない。ファイルに書き込むので、core に混ざるとファイルを持たないリモート版で動かなくなる。

## 名乗る版

`core-server.ts` の `SERVER_VERSION` は、初期化でクライアントに名乗る版。利用者から報告を受けたときに、どの版が答えたのかを切り分ける手がかりになる。`package.json` の版と手でそろえ、ずれると `core-server.test.ts` が落ちる。

## データの読み込み

JSON は `data-store.ts` だけが import し、型と id から引く Map をそこで作る。名前から引く `NameResolver` は `name-resolvers.ts` に置く。ツールは JSON を直接 import せず、この 2 つから受け取る。Map をツールごとに作ると、リモート版でリクエストのたびに作り直しになる。

## 配布物の検証

- `npm run test:dist` は repo の `node_modules` から dist を起動するので、利用者の環境で依存が解決できるかは確かめられない。それを確かめているのは `scripts/pack-and-install-smoke.sh` だけなので、CI から外さない
- 意図した版上げ以外で `package-lock.json` の integrity が変わったら、サプライチェーンの事故として扱い、原因がわかるまでマージしない
