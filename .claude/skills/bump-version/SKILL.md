---
name: bump-version
description: npm で公開する mcp-server（@nonz250/ai-rotom）の版を上げ、GitHub Release を作って npm への公開とリモート版のデプロイまでを進める。ユーザーが「バージョンを上げて」「版上げ」「bump version」「リリースして」「1.5.0 を出して」「npm に公開して」と言ったときに使用する。
argument-hint: "[X.Y.Z]"
---

# mcp-server の版上げとリリース

版の方針はルートの CLAUDE.md の「版とリリース」に従う。npm に出した版は取り消せないので、Release を公開する前に必ずユーザーの確認を取る。

## 1. 上げる版を決める

上げる版はユーザーが決める。引数で渡された版は `$ARGUMENTS` で、これを使う。空なら、今の版と前のタグからマージされた PR を見せて聞く。上げ幅を提案しない。

```bash
node -p "require('./packages/mcp-server/package.json').version"
gh release list --limit 1
gh pr list --state merged --base main --search "merged:>$(gh release view --json publishedAt -q .publishedAt)" --json number,title -q '.[] | "#\(.number) \(.title)"'
```

`X.Y.Z` の形で、今の版より大きいことを確かめる。引数に `v` が付いていたら外す。タグにも `v` は付けない。

## 2. 版を書き換える

main から topic ブランチを切り、次の 3 か所を同じ版にする。

```bash
git pcheckout bump-version-X.Y.Z
npm version X.Y.Z --workspace=@nonz250/ai-rotom --no-git-tag-version --ignore-scripts
```

これで `packages/mcp-server/package.json` と `package-lock.json` が変わる。続けて `packages/mcp-server/src/core-server.ts` の `SERVER_VERSION` を手で同じ版に書き換える。初期化でクライアントに名乗る版で、ずれると `core-server.test.ts` が落ちる。

`package-lock.json` の差分が mcp-server の `version` の 1 行だけであることを確かめる。integrity などほかの行が変わっていたら、先に進まずユーザーに伝える。

```bash
git diff --stat
git diff package-lock.json
npm test
```

## 3. PR を作る

コミットメッセージは `chore: mcp-server のバージョンを X.Y.Z に上げる` とし、本文にこの版に含める主な変更と、破壊的変更があればそのことを書く。create-pr の手順で Draft PR を作る。Ready とマージはユーザーが行う。

## 4. Release を下書きで作る

PR がマージされたら、マージコミットを指して Release を下書きで作る。デプロイのワークフローはタグのコミットが main にあることを確かめるので、main のコミットを指す。

```bash
git -C . switch main && git -C . pull --ff-only
gh release create X.Y.Z --draft --title X.Y.Z --target "$(git -C . rev-parse HEAD)" --generate-notes
```

前の版から破壊的変更があるときは、自動で作られた一覧の上に `## Breaking Changes` を足し、該当する PR と利用者が何をすればよいかを書く。書き方は過去の Release にそろえる。

```bash
gh release view X.Y.Z --json body -q .body > "$CLAUDE_JOB_DIR/tmp/release-X.Y.Z.md"
gh release edit X.Y.Z --notes-file "$CLAUDE_JOB_DIR/tmp/release-X.Y.Z.md"
```

`CLAUDE_JOB_DIR` がない環境では `/tmp` を使う。

## 5. 公開する

下書きの URL と本文をユーザーに見せ、公開してよいか確認を取ってから公開する。

```bash
gh release edit X.Y.Z --draft=false
```

公開すると次の 2 つのワークフローが動く。

- `publish.yml` が npm に公開する
- `deploy-worker.yml` がリモート版をデプロイする

それぞれの run を探し、`run_in_background` で完了を待つ。

```bash
gh run list --workflow publish.yml --event release --limit 1 --json databaseId,status
gh run list --workflow deploy-worker.yml --event release --limit 1 --json databaseId,status
gh run watch <run-id> --exit-status
```

run が waiting のまま進まないときは、その状態をユーザーに伝えて待つ。失敗したら、ログの要点をユーザーに伝える。勝手に再実行しない。

## 6. 結果を確かめる

npm の版が上がったことを確かめる。

```bash
npm view @nonz250/ai-rotom version
```

本番のリモート版にリクエストを送って確かめることはしない。デプロイのワークフローが成功したことまでを報告し、動作の確認はユーザーに任せる。
