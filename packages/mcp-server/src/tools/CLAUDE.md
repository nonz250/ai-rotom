# packages/mcp-server/src/tools/

MCP ツールの実装。責務別にサブディレクトリで分けている。

## サブディレクトリの使い分け

| ディレクトリ | 用途 | 例 |
|---|---|---|
| `info/` | 単一エンティティの情報取得（`get_*`） | `get_pokemon_info`, `get_move_info` |
| `search/` | 条件指定による検索・逆引き（`search_*`） | `search_pokemon_by_move`, `search_pokemon_by_ability` |
| `calc/` | 数値計算（`calculate_*`, 計算系分析） | `calculate_damage_single`, `list_speed_tiers`, `analyze_damage_range` |
| `analysis/` | 複数要素を組み合わせた分析 | `analyze_matchup`, `analyze_selection`, `find_counters` |
| `party/` | ユーザーパーティの永続化 CRUD / インポート | `save_party`, `load_party`, `list_parties`, `delete_party`, `import_party_from_text` |
| `schemas/` | Zod 入力スキーマ | **将来廃止予定**（現状は shared/schemas/ に移行済み） |

**迷ったら「何を返すか」基準**:
- 特定の 1 件を返す → `info/`
- 条件を満たす複数件を返す → `search/`
- 数値を計算して返す → `calc/`
- 情報を統合して判断材料を返す → `analysis/`

## 新規ツール追加の手順

### 1. ファイル作成（`tools/<subdir>/foo.ts`）

```ts
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { pokemonNameResolver } from "../../name-resolvers.js";
import { pokemonById, toDataId } from "../../data-store.js";
import { TOOL_RESPONSE_HINT_CONTENT } from "../../tool-response-hint.js";

const inputSchema = { name: z.string() };

export function registerFooTool(server: McpServer): void {
  server.registerTool(
    "foo",
    {
      title: "Foo ツール",
      description: "...",
      inputSchema,
    },
    async (args) => {
      try {
        const result = /* ロジック */;
        // 成功レスポンスは content 末尾に必ず TOOL_RESPONSE_HINT_CONTENT を append する
        // (recency bias を使ってツール再呼び出しを誘導する設計)。
        return {
          content: [
            { type: "text", text: JSON.stringify(result) },
            TOOL_RESPONSE_HINT_CONTENT,
          ],
        };
      } catch (error) {
        // エラーレスポンスには hint を付けない (ノイズになるため)。
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          }],
          isError: true,
        };
      }
    },
  );
}
```

### 2. 共通パターン

- **入力検証**: Zod スキーマで（`@ai-rotom/shared` の既存スキーマ `pokemonSchema` 等を活用）
- **名前解決**: `name-resolvers.ts` の `NameResolver` 経由
  - 類似名サジェスト: `resolver.suggestSimilar(name, 3)` を使い、エラーメッセージに含める
- **ダメ計**: `DamageCalculatorAdapter`（`@ai-rotom/shared` から import）
  初期化時に `pokemonEntryProvider` を必ず注入する:
  ```ts
  const calculator = new DamageCalculatorAdapter(resolvers, pokemonEntryProvider);
  ```
- **エラー応答**: `{ content: [...], isError: true }` + `JSON.stringify({ error })`
- **成功応答**: `JSON.stringify(data)` をテキストで返す

### 3. `server.ts` に登録

```ts
import { registerFooTool } from "./tools/<subdir>/foo.js";
// ...
registerFooTool(server);
```

### 4. テスト作成

`tools/<subdir>/foo.test.ts` をコロケーションで配置。以下をカバーする:

- 正常系（既知データで期待値が一致）
- エラー系（存在しない名前でエラー + サジェスト）
- エッジケース（空配列・上限値など）

### 5. ドキュメント

ルートの `/CLAUDE.md` の MCP ツール一覧に追記する。

## 既存ツールのリファクタ時の注意

分析ロジックが `@ai-rotom/shared` の `analysis/` にあれば **必ずそちらを使う**。
重複実装しない:

- タイプ相性計算: `calculateTypeEffectiveness(gen, attackingType, defenderTypes)`
- 素早さ比較: `compareSpeed(a, b)` → `"faster" | "slower" | "tie"`
- 実数値計算: `calculateStatValue(stat, baseStat, sp, plus, minus)`
  （ただし `@smogon/calc` の `Pokemon` 経由の方が便利な場合は委譲可）

## ツール間の呼び出し

- tool から他 tool の `register*Tool` は呼ばない（MCP 上では独立）
- 共通ロジックが必要なら shared に抽出する

## CLAUDE.md の規約を守る

- マジックナンバー禁止（named constant を使う）
- TypeScript strict エラーなし
- ESM (`import` 先は `.js` 拡張子付き)
