# ai-rotom

ポケモンチャンピオンズの対戦アドバイザー MCP サーバー。

## 基本思想

**「プログラムは正確なデータを出す。AI はデータを元に考える。」**

| 機能 | プログラム（ツール）の責務 | AI の責務 |
|---|---|---|
| ダメージ計算 | 正確な数値計算（1 対 1 / 全技 / 6v6 の 3 粒度） | 結果の解釈・説明 |
| 選出アドバイス | タイプ相性・ダメ計・素早さ等のデータ提供 | データを総合して選出を判断・提案 |
| パーティ構築 | パーティの弱点・攻撃範囲分析 | 構築案の提案 |
| 対策案 | 候補の検索・候補ごとの対面データ（`search_pokemon_by_type_effectiveness` / `analyze_matchup`） | 候補の選定・勝ち筋の判断 |

ツールに「最適な選出」「正解の構築」のような判断を返させない。判断の材料になるデータだけを返す。

## IMPORTANT: センシティブ情報を書かない

パブリックリポジトリなので、CLAUDE.md・README・コード・コミットメッセージ・PR・Issue に次を書かない。

- トークン・API キー・パスワード・アカウント ID・デプロイ先のサブドメインなどの値
- それらに関わる運用の情報。どのトークンにどの権限があるか、誰が承認するか、環境の保護設定、トークンの差し替え手順など、攻撃の手がかりになるもの

運用の情報はメンテナーの手元で管理する。設定ファイルに書く値はプレースホルダーにする。

例外は、公開している公式のリモート MCP サーバーの URL だけ。利用者がつなぐのに要るので README に書く。

## IMPORTANT: 外部サービス名の取り扱い

データ取得元の外部サービス名（API 名・サイト名）をドキュメント・コミットメッセージ・PR 説明に書かない。設計ドキュメントやコード内コメントでは「外部 API」「攻略サイト」のような一般的な表現を使う。

## IMPORTANT: README の「著作権・商標」と「ライセンス」の章を動かさない

README の「著作権・商標」と「ライセンス」の章は、移動も編集もしない。権利者に向けた表明と、ソースコードと権利の範囲の区別なので、文面と、冒頭の紹介の直後に続けて置く位置を保つ。README の構成を見直すときも、この 2 つの章には手を入れない。

## パッケージの境界

- `packages/` には npm workspace のパッケージだけを置く。`shared/` と `data/` は、どのパッケージからも使うルート直下の資産
- `shared/` は package.json を持たないソースディレクトリで、alias で参照する。mcp-server の `dist` に bundle して配るので、npm パッケージにしない
- shared は mcp-server を import しない。具象データが必要なら `PokemonEntryProvider` や `LearnsetProvider` のように DI で受ける。ランタイム依存は `@smogon/calc` と `zod` だけにする
- remote-server が mcp-server から使ってよいのは `@ai-rotom/mcp-core`（`packages/mcp-server/src/core.ts`）に出したものだけ。wrangler などの Workers 用の依存を mcp-server に入れない
- remote-server は第三者パッケージの版を自分で宣言しない。mcp-server の `dependencies` から hoist されたものをバンドルする。別々に固定すると版がずれ、MCP SDK が 2 つ入って Worker 内で混ざる

## 配布物の依存

- `dist/index.mjs` にインライン化するのは自前のコード（`shared/src/*`）とデータ（`data/champions/*.json`）だけ。第三者パッケージは mcp-server の `dependencies` に exact pin で宣言し、利用者環境の `npm install` で解決させる。bundle すると利用者環境で同じコードを重複して抱え、版の固定も効かなくなる
- alias の paths は `tsconfig.base.json` に集約し、各パッケージは extends するだけにする。新しいパッケージを足すときに alias を書き直さずに済む
- mcp-server の `tsconfig.json` は `rootDir: "../.."` にしている。alias で shared や data のファイルがプログラムに入っても TS6059 にならないようにするため

## リモート版のデプロイ

- `packages/remote-server` は、利用者が自分のアカウントにデプロイする。npm の公開物には含めない
- CI のデプロイでは、Secrets を持つのはデプロイのジョブだけにする。依存パッケージやテストのコードが動くビルドのジョブに Secrets を渡すと、依存が乗っ取られたときにトークンを盗まれる
- デプロイのジョブは、ビルドのジョブで検査したバンドルをハッシュで照合してそのまま上げる。ソースから組み立て直すと、検査したものと上げるものが一致する保証がなくなる
- npm のインストールは `--ignore-scripts` で行う。インストール時スクリプトはバンドルにもデプロイにも要らない
- リモート版の `AUTH_TOKEN` は CI に渡さない
- フォークからの PR に Secrets を渡さないため、`pull_request_target` でデプロイを走らせない

## データ修正方針

`data/champions/*.json` は `@smogon/calc` Gen 0 (Champions) から抽出し、名前・PP・効果・メガシンカの特性と種族値を攻略サイトの公開情報で訂正している。

実行時のダメ計は `@smogon/calc` Gen 0 を使うが、内蔵の値は古い。`DamageCalculatorAdapter` が `PokemonEntryProvider` 経由で pokemon.json の値を `overrides` として注入し、内蔵の値を上書きする。

## テスト

- テストは `*.test.ts` としてコロケーションで置く
- `@smogon/calc` 自体はテストしない。ライブラリ側でテスト済みのため

## ポケモンチャンピオンズ固有ルール

従来作の知識で書くと壊れる前提。

- 個体値は廃止された。全ポケモン一律 31 で、定数は `MAX_IV`
- 努力値 (EV) は能力ポイント (SP) に変わった。各ステ 0〜32、合計 0〜66 で、1 SP が実数値 +1 にそのまま加わる。定数は `MAX_STAT_POINT_PER_STAT` と `MAX_STAT_POINT_TOTAL`
- メガシンカは 1 試合に 1 回だけ
- テラスタルはゲーム側で未対応なので実装しない
- 対戦レベルは 50 固定で、定数は `DEFAULT_LEVEL`
- 特性は各ポケモン基本 1 つ。これは `@smogon/calc` Gen 0 の仕様で、隠れ特性は pokemon.json で管理する
