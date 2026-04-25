# Third Party Licenses

This package (`@nonz250/ai-rotom`) bundles source code from the following
third-party libraries into `dist/index.mjs`. Their licenses and copyright
notices are reproduced below, in compliance with each license's terms.

---

## @smogon/calc

- Package: `@smogon/calc`
- Version: 0.11.0
- License: MIT
- Upstream repository: https://github.com/smogon/damage-calc
- Source at: https://github.com/smogon/damage-calc/blob/master/LICENSE
- Retrieved: 2026-04-19 (JST)

### License text

```
The MIT License (MIT)

Copyright (c) 2013-2025 Honko and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## @pokesol/pokesol-text-parser-ts

- Package: `@pokesol/pokesol-text-parser-ts`
- Version: 1.0.0
- License: MIT
- Upstream tarball:
  `https://registry.npmjs.org/@pokesol/pokesol-text-parser-ts/-/pokesol-text-parser-ts-1.0.0.tgz`
- Tarball integrity (sha512):
  `tp020uhgCFjknSfcpRQwaFDH3p2wOATXpUpVVoIIU+yBv3zO5XwnzH4E/E+k8NYkALyMp+00J4sBBkQjDJKf0g==`
- Retrieved: 2026-04-23 (JST)
- Purpose: ポケソルテキスト (Showdown 風 1 匹分の育成記述) のパース。
  `import_party_from_text` ツールで一括取り込みに使用している。

### License text

```
MIT License

Copyright (c) 2024 Hikaru Kazama

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Sources and notes

- LICENSE 原文の取得元:
  `https://raw.githubusercontent.com/smogon/damage-calc/master/LICENSE`
- Upstream default branch: `master` (at retrieval time `main` は存在しない)
- Upstream default branch HEAD commit SHA (取得時点):
  `187514b0a89851c31c1ce754773a9a3a83f1344f`
- LICENSE ファイルを最後に更新した commit SHA:
  `9f15af18785929f917078462385fd4f91bcb6510` (2025-02-27)
- Upstream の `package.json` でも `"license": "MIT"` と宣言されている。
- `@pokesol/pokesol-text-parser-ts` の LICENSE は npm tarball (dist) に同梱された
  `LICENSE` をそのまま転記している。

## Maintenance policy

When bumping `@smogon/calc` version in `vendor/`:

1. Regenerate this file from upstream LICENSE at the new commit.
2. Update the Version and Retrieved fields.
3. Update `vendor/README.md` integrity hash and commit SHA.

When bumping `@pokesol/pokesol-text-parser-ts`:

1. Fetch the new tarball and replace the LICENSE block if upstream changed it.
2. Update the Version / integrity / Retrieved fields above.
