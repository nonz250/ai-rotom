# packages/mcp-server/src/tools/

## 置き場所は返すもので決める

- 特定の 1 件を返すなら `info/`
- 条件に合う複数件を返すなら `search/`
- 数値を計算して返すなら `calc/`
- 複数の情報を合わせて判断材料を返すなら `analysis/`
- ファイルに保存するなら `party/`。登録先は `server.ts` で、それ以外は `core-server.ts` に登録する

## 入力

- 文字列・配列・record には上限を付ける。リモート版は 1 リクエストの CPU 時間に上限があり、入力の大きさがそのまま処理時間に響く
- 名前は `nameInputSchema`、パーティは `.min(MIN_PARTY_MEMBERS).max(MAX_PARTY_MEMBERS)`、ポケモンごとの技は `movesByPokemonSchema` で受ける。名前が見つからないと全候補との編集距離を計算するので、`z.string()` のまま受けない
- 引数全体の要素数は `core-server.ts` の `MAX_TOOL_INPUT_ELEMENTS` で SDK が先に打ち切る。これより大きな正当な入力を持つツールを足すなら、値を見直す
- 技構成を省略すると習得技すべてを計算するツールは、`MovesRequirement` を受けて `assertMovesSpecified` を呼ぶ。リモート版では moves が必須になる

## 処理

- ダメ計は `calc/damage-calculator.ts` の共有インスタンス `damageCalculator` を使い、ツールごとに `new DamageCalculatorAdapter` しない
- 名前が見つからないときは `suggestSimilar` の候補をエラーに含める
- ツールから他のツールの `register*Tool` を呼ばない。共通の処理が要るなら shared に出す

## 応答

- 成功は `withHint` で返す。末尾に次のツール呼び出しを促す文面を足すためで、エラーには付けない
- エラーは `toErrorResponse` で返し、`isError` を自前で書かない
- AI クライアントに見せてよい文面は `UserFacingError` で投げる。それ以外の例外は固定の文面に置き換わる
- 複数技のダメ計は `summarizeMoveDamages` で要約する。乱数の配列を全技ぶん返すと AI のコンテキストを圧迫するので、乱数の内訳は単発のダメ計でだけ返す

## ツールを足したら

README の「利用可能な MCP ツール」に追記する。
