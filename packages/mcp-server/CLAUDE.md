# packages/mcp-server/

MCP プロトコル対応と具象データ供給を担うアプリケーション層。

## 位置付け

- リポジトリ唯一の npm workspace パッケージ
- `npx @nonz250/ai-rotom` で起動する MCP サーバーの実装
- shared のロジックに JSON データを注入して動かす

## エントリポイント

- `src/index.ts`: `#!/usr/bin/env node` shebang + `startServer()` 呼び出し
- `src/server.ts`: `McpServer` 生成 + 各ツールの `register*Tool` 呼び出し
- bin は `dist/index.mjs`（tsdown でビルド、JSON と shared 一式を bundle）

## コア層の役割

| ファイル | 役割 |
|---|---|
| `data-store.ts` | `@data/*.json` の import + 型 + id→entry Map + `pokemonEntryProvider` 実装 |
| `name-resolvers.ts` | `NameResolver` インスタンス (pokemon/move/ability/item/nature) |
| `instructions.ts` | MCP `instructions` テキスト（ポケチャン固有仕様の説明） |
| `server.ts` | MCP サーバー生成 + ツール登録 |

## データフロー

```
JSON (data/champions/)
  ↓ import (tsdown でインライン化)
data-store.ts → pokemonById Map / pokemonEntryProvider / 他 Map
  ↓
tools/ 各ツール → @ai-rotom/shared の DamageCalculatorAdapter に
                   pokemonEntryProvider を注入 (DI)
  ↓
@smogon/calc で計算 (pokemon.json の overrides が効く)
  ↓
MCP レスポンス
```

## 新規 JSON データ追加時の手順

1. `data/champions/` に JSON ファイルを追加
2. `data-store.ts` に以下を追加:
   - `import xxxData from "@data/xxx.json"`
   - 型定義 `interface XxxEntry { ... }`（shared に置くべき場合は `@ai-rotom/shared` から import）
   - `export const championsXxx: XxxEntry[] = xxxData as XxxEntry[]`
   - id → entry の Map: `export const xxxById = new Map(...)`
3. 必要なら `name-resolvers.ts` に `NameResolver` インスタンスを追加
4. 使用する tool で `../../data-store.js` 経由で import

## 新規 MCP ツール追加は `src/tools/CLAUDE.md` を参照

## 配布設定

- `package.json` の `files: ["dist"]` で dist のみ同梱
- `bin: { "ai-rotom": "./dist/index.mjs" }`
- tsdown が JSON を bundle 内にインライン化するので、`data/` の物理同梱は不要

## パッケージ依存関係

- `@modelcontextprotocol/sdk`: MCP SDK
- `@smogon/calc`: ダメージ計算エンジン（`file:vendor/smogon-calc-0.11.0.tgz`）
- `zod`: 入力検証
- `@ai-rotom/shared`: **alias 経由で参照するため package.json には書かない**

## 開発コマンド

```bash
# このパッケージのビルド
npm run build --workspace=@nonz250/ai-rotom

# ローカル実行 (手動テスト時)
node packages/mcp-server/dist/index.mjs
```
