# vendor/

npm registry に未 publish のサードパーティ tarball を置くディレクトリ。
monorepo root の `devDependencies` から `file:vendor/...` で参照する。

## smogon-calc-0.11.0.tgz

| 項目 | 値 |
|---|---|
| Package | `@smogon/calc` |
| Version | `0.11.0` |
| Upstream | https://github.com/smogon/damage-calc |
| Upstream commit SHA | `<TBD: 再生成時に記入>` |
| License | MIT (詳細は `packages/mcp-server/THIRD_PARTY_LICENSES.md`) |
| Integrity (sha512) | `sha512-N6QXidvn22hvcZMao22XTO8svpnnh3wYu1gwNj5HXOf4smHZGMcWafp7kNkbeqEhcxmTy8htnPfBXtps2EBzSQ==` |

### 生成手順

`smogon/damage-calc` を該当 commit で clone したあと:

```bash
cd packages/calc
npm run build
npm pack
# → smogon-calc-0.11.0.tgz が生成される
mv smogon-calc-0.11.0.tgz <ai-rotom root>/vendor/
```

### 差し替え時のレビューチェックリスト

1. 既知の upstream commit から再生成したこと（必ずコミット SHA を記録）
2. `npm install` 後に `package-lock.json` の `node_modules/@smogon/calc`
   エントリの `integrity` 値と、このファイルの Integrity 値が一致すること
3. **Integrity 値が予期せず変わった場合はサプライチェーン事故として扱い、
   原因が確定するまで commit しない**
4. `packages/mcp-server/THIRD_PARTY_LICENSES.md` の Version / Retrieved /
   LICENSE 原文を更新
5. 全検証スイート（`npm test` / `npm run build` / `bash scripts/verify-dist-bundle.sh`
   / `npm run test:dist` / `bash scripts/pack-and-install-smoke.sh`）を
   通してから PR を出す
