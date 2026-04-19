# vendor/

npm registry に未 publish のサードパーティ tarball を置くディレクトリ。
monorepo root の `devDependencies` から `file:vendor/...` で参照する。

## smogon-calc-0.11.0.tgz

| 項目 | 値 |
|---|---|
| Package | `@smogon/calc` |
| Version | `0.11.0` |
| Upstream | https://github.com/smogon/damage-calc |
| Upstream commit SHA | 記録なし（tarball 内 `package.json.gitHead` 欠落のため確定不能） |
| License | MIT (詳細は `packages/mcp-server/THIRD_PARTY_LICENSES.md`) |
| Integrity (sha512) | `sha512-N6QXidvn22hvcZMao22XTO8svpnnh3wYu1gwNj5HXOf4smHZGMcWafp7kNkbeqEhcxmTy8htnPfBXtps2EBzSQ==` |

### Chain of custody（現行 0.11.0 について）

- 現行 tarball は `gitHead` を含まずに生成されたため、upstream の commit
  SHA を後追いで特定できない。Chain of custody の一意指紋としては上記
  `Integrity (sha512)` を**唯一の検証値**として扱う
- `package-lock.json` の `node_modules/@smogon/calc` エントリの `integrity`
  値と常に一致していることを `npm install` / CI の検証で担保する
- 次回の差し替え（0.12.0 以降 / 再ビルド）からは、生成時に commit SHA を
  明示記録する運用を開始する（下記「生成手順」と「チェックリスト」参照）

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
