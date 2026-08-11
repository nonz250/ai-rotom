# vendor/

npm registry に未 publish のサードパーティ tarball を置くディレクトリ。
monorepo root の `devDependencies` から `file:vendor/...` で参照する。

## smogon-calc-0.11.0.tgz

| 項目 | 値 |
|---|---|
| Package | `@smogon/calc` |
| Version | `0.11.0` |
| Upstream | https://github.com/smogon/damage-calc |
| Upstream commit SHA | `e7e74f3036c9793813e197e28d54cc857ae7e8dd` (2026-08-10 UTC, master HEAD 時点) |
| License | MIT (詳細は `packages/mcp-server/THIRD_PARTY_LICENSES.md`) |
| Integrity (sha512) | `sha512-W23VZ88MaXP+1o62gTqJUaNFw7n4ka0YmdVk32fuqSoDb+X+5SwWrOkHWc9Bn5QiO8LNtd/P9/3aD5MUVP8zXg==` |

### バージョン番号について

upstream の `calc/package.json` は 2026-03-11 に `v0.11.0` がタグ打ちされて以降、
版数が bump されないまま master に Pokemon Champions サポート (commit
`c0bee8660f`, 2026-04-16) と複数の Champions 修正が積まれている。
当 tarball のバージョンも upstream に合わせて `0.11.0` 表記のままにしているが、
**npm registry に公開されている `@smogon/calc@0.11.0` (2026-03-11 タグ) とは
中身が異なる**。判別は上記 Integrity (sha512) と Upstream commit SHA で行う。

### Chain of custody

- 当 tarball も `package.json.gitHead` は欠落するが、生成元 commit SHA を
  上表に明示記録している
- `package-lock.json` の `node_modules/@smogon/calc` エントリの `integrity`
  値と上表の Integrity の一致は、差し替え時のレビューチェックリストで人手確認する。
  CI では検証していない
- `npm ci` が検証するのは lock と tarball の一致であって、上表とは突き合わせない。
  さらに npm キャッシュに lock の integrity と一致する blob が残っていると、
  `npm ci` は tarball を開かずキャッシュ側の内容を展開して成功する。
  **CI が緑であることは lock と vendor tarball が一致していることの証明にならない**

### 生成手順

```bash
git clone https://github.com/smogon/damage-calc.git
cd damage-calc
git checkout <commit>
git rev-parse HEAD    # ← この値を下記のチェックリスト 1 で記録する

# calc の bundle ステップは repo root の bundler.js を呼び、それが
# @babel/core / terser を require するため root 側の install も要る。
npm ci --ignore-scripts

cd calc
npm ci
npm run build
npm pack
# → smogon-calc-0.11.0.tgz が生成される
mv smogon-calc-0.11.0.tgz <ai-rotom root>/vendor/
```

`npm install` ではなく `npm ci` を使う。upstream は `calc/package-lock.json` を
commit しているので、`npm ci` なら toolchain が固定されて tarball を再現できる。

生成した tarball の sha512 は次のコマンドで確認できる (上表の Integrity と一致すること)。

```bash
printf 'sha512-'; openssl dgst -sha512 -binary vendor/smogon-calc-0.11.0.tgz | openssl base64 -A
```

現在の記録値は npm 11.16.0 / Node 26.3.1 で再現を確認したもの。

### 差し替え時のレビューチェックリスト

1. 既知の upstream commit から再生成したこと。上記表の「Upstream commit SHA」
   に `git rev-parse HEAD` の値を必ず記録する
2. tarball を差し替えたら、次のコマンドで依存を強制再解決する。

   ```bash
   npm install --save-dev "file:vendor/smogon-calc-0.11.0.tgz"
   ```

   通常の `npm install` は、lock の `integrity` と既存 node_modules が `file:`
   指定を満たしている限り tarball を開かない。中身だけ差し替えても「up to date」
   と出て lock も node_modules も旧版のまま残る（tarball 内の version を bump
   しても `--force` を付けても同じ）。`rm -rf node_modules/@smogon/calc` して
   からでも、npm キャッシュが lock の旧 integrity に一致する blob を返すため
   旧版が復元される。上記は同一 path の指定なので package.json に差分は出ない。
3. 再解決後、`package-lock.json` の `node_modules/@smogon/calc` エントリの
   `integrity` 値を上表の Integrity に転記する（README を先に書き換えない）。
   あわせて lock の差分が integrity の 1 行だけであることを確認する。
   `--save-dev` は全依存ツリーを再解決するため、範囲指定の依存が同時に動くことがある
4. tarball 内 `package.json` の `scripts` / `dependencies` / `bin` に差分がないこと。
   CI の `npm ci` は `--ignore-scripts` を付けていないため、upstream が
   `postinstall` を追加すると CI ランナーと開発機で実行される
5. **tarball を差し替えていないのに Integrity 値が変わった場合はサプライチェーン
   事故として扱い、原因が確定するまで commit しない**
6. `packages/mcp-server/THIRD_PARTY_LICENSES.md` を更新する。upstream commit SHA
   を持つ箇所は Version 行と「Sources and notes」の HEAD SHA 行の 2 つあるので
   両方直すこと。Retrieved と、upstream の LICENSE 原文が変わっていれば原文も更新
7. 旧 tarball と新 tarball で Gen 0 (Champions) のデータと計算結果を突き合わせ、
   差分を PR 本文に記載する。データが同一でも mechanics の修正で数値が動くことがある
8. 全検証スイート（`npm test` / `npm run build` / `bash scripts/verify-dist-bundle.sh`
   / `npm run test:dist` / `bash scripts/pack-and-install-smoke.sh`）を
   通してから PR を出す
