# shared/

ポケチャンの対戦ロジック。依存の向きとランタイム依存の制限はルートの CLAUDE.md の「パッケージの境界」に従う。

## モジュールを足すとき

- 外から使う型と関数は `src/index.ts` から export する。mcp-server は alias でこの入口だけを参照する
- テストで JSON などの具象データを import しない。shared はデータを持たず DI で受けるので、必要ならモックを作る

## 既存の計算を使う

タイプ相性は `calculateTypeEffectiveness`、実数値は `calculateStatValue`、素早さの比較は `compareSpeed`、ダメ計は `DamageCalculatorAdapter` にまとめてある。ツールで同じ計算が要るときは書き起こさずにこれを使う。結果がずれると、ツールごとに数値が食い違う。

## 全技ダメ計の候補技は Adapter が決める

`calculateAllMoves` は攻撃側の `moves` があればその技だけ、なければ `LearnsetProvider` の習得技を計算する。呼び出し側で結果を習得技に絞り直さない。learnset が未整備のフォルムは、mcp-server の `learnsetProvider` が元のポケモンの習得技で補う。

## 日本語名は NameResolver で照合する

データの日本語名は全角英数字の `１０まんボルト` と半角英数字の `メガリザードンX` が混在している。`NameResolver` は NFKC で正規化して照合するので、`nameJa === input` のような直接比較で名前を引かない。
