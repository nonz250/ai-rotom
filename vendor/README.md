# vendor/

npm registry に未 publish のサードパーティ tarball を置くディレクトリ。
monorepo root の `devDependencies` から `file:vendor/...` で参照する。

## smogon-calc-0.11.0.tgz

| 項目 | 値 |
|---|---|
| Package | `@smogon/calc` |
| Version | `0.11.0` |
| Upstream | https://github.com/smogon/damage-calc |
| Upstream commit SHA | `20f43c4ec138950900a45e9804a5fc5fd148dbec` (2026-05-05, master HEAD 時点) |
| License | MIT (詳細は `packages/mcp-server/THIRD_PARTY_LICENSES.md`) |
| Integrity (sha512) | `sha512-M3OBfhSEUm0AwdlP8h6Pk+vrr1g2Ob5PzmAm4Jy7bMzowdtlWOqGUxekY+dxHYvuKVkU3BGXSmSZ4vQRuXu9lQ==` |

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
  値と上表の Integrity が常に一致していることを `npm install` / CI の検証で担保する

### 生成手順

`smogon/damage-calc` を該当 commit で clone したあと:

```bash
git -C <local clone> rev-parse HEAD    # ← この値を下記のチェックリスト 1 で記録する
cd packages/calc
npm run build
npm pack
# → smogon-calc-0.11.0.tgz が生成される
mv smogon-calc-0.11.0.tgz <ai-rotom root>/vendor/
```

### 差し替え時のレビューチェックリスト

1. 既知の upstream commit から再生成したこと。上記表の「Upstream commit SHA」
   に `git rev-parse HEAD` の値を必ず記録する
2. `npm install` 後に `package-lock.json` の `node_modules/@smogon/calc`
   エントリの `integrity` 値と、このファイルの Integrity 値が一致すること
3. **Integrity 値が予期せず変わった場合はサプライチェーン事故として扱い、
   原因が確定するまで commit しない**
4. `packages/mcp-server/THIRD_PARTY_LICENSES.md` の Version / Retrieved /
   LICENSE 原文を更新
5. 全検証スイート（`npm test` / `npm run build` / `bash scripts/verify-dist-bundle.sh`
   / `npm run test:dist` / `bash scripts/pack-and-install-smoke.sh`）を
   通してから PR を出す
