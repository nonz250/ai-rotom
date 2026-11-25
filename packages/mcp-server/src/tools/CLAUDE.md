# packages/mcp-server/src/tools/

MCP ツールの実装。責務別にサブディレクトリで分けている。

## サブディレクトリの使い分け

| ディレクトリ | 用途 | 例 |
|---|---|---|
| `info/` | 単一エンティティの情報取得（`get_*`） | `get_pokemon_info`, `get_move_info` |
| `search/` | 条件指定による検索・逆引き（`search_*`） | `search_pokemon_by_move`, `search_pokemon_by_ability` |
| `calc/` | 数値計算（`calculate_*`, 計算系分析） | `calculate_damage_single`, `list_speed_tiers`, `analyze_damage_range` |
| `analysis/` | 複数要素を組み合わせた分析 | `analyze_matchup`, `analyze_selection` |
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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { nameInputSchema } from "@ai-rotom/shared";
import { pokemonNameResolver } from "../../name-resolvers.js";
import { pokemonById, toDataId } from "../../data-store.js";
import { toErrorResponse, withHint } from "../../tool-response-hint.js";

const inputSchema = { name: nameInputSchema };

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
        // 成功レスポンスは withHint 経由で返す。ヘルパー内で content 末尾に
        // TOOL_RESPONSE_HINT_CONTENT を必ず append し、recency bias を使って
        // 次手のツール再呼び出しを誘導する設計を構造的に強制する。
        return withHint({ type: "text" as const, text: JSON.stringify(result) });
      } catch (error) {
        // エラー時は共通の toErrorResponse を使う (hint なし。ノイズ回避)。
        return toErrorResponse(error);
      }
    },
  );
}
```

### 2. 共通パターン

- **入力検証**: Zod スキーマで（`@ai-rotom/shared` の既存スキーマ `pokemonSchema` 等を活用）
  - 文字列・配列・record には必ず上限を付ける。リモート版は 1 リクエストの CPU 時間に上限があり、入力の大きさがそのまま処理時間とメモリに響くため
  - 名前の文字列は `nameInputSchema`、パーティは `.min(MIN_PARTY_MEMBERS).max(MAX_PARTY_MEMBERS)` を使う。`z.string()` のまま受けない。名前が見つからないと全候補との編集距離を計算するため
  - 引数全体の要素数は `core-server.ts` の `MAX_TOOL_INPUT_ELEMENTS` で SDK が先に打ち切る。これより大きな正当入力を持つツールを足すなら、値の根拠と合わせて見直す
- **名前解決**: `name-resolvers.ts` の `NameResolver` 経由
  - 類似名サジェスト: `resolver.suggestSimilar(name, 3)` を使い、エラーメッセージに含める
- **ダメ計**: `calc/damage-calculator.ts` が export する共有インスタンス `damageCalculator` を import する（`new DamageCalculatorAdapter(...)` を各ツールで個別に生成しない）:
  ```ts
  import { damageCalculator } from "../../calc/damage-calculator.js";
  ```
- 攻撃側の技構成を省略すると習得技すべてを計算するツールは、`MovesRequirement` を受け取り `assertMovesSpecified` を呼ぶ。Workers 版では moves が必須になる
- ポケモン名ごとに技を受け取る `moves` 引数は shared の `movesByPokemonSchema` で受ける。匹数・技数・名前の文字数の上限はこのスキーマが持つ
- 複数技のダメ計結果は `summarizeMoveDamages` で要約して返す。乱数配列を全技ぶん返すと AI のコンテキストを圧迫するため、乱数の内訳は単発のダメ計でだけ返す
- **エラー応答**: `{ content: [...], isError: true }` + `JSON.stringify({ error })`
- **成功応答**: `JSON.stringify(data)` をテキストで返す

### 3. `core-server.ts` に登録

パーティ保存系のツールだけは `server.ts` に登録する（`packages/mcp-server/CLAUDE.md` 参照）。

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
