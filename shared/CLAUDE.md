# packages/shared/

ポケチャン対戦ロジックの再利用可能なコアライブラリ。

## 位置付け

- mcp-server から `@ai-rotom/shared` alias で参照される
- **`package.json` を持たない単純ソースディレクトリ**
- 将来 api-server / web-ui が追加されても alias を共有するだけで再利用可能

## 厳守する原則

### 依存方向

- **shared は mcp-server に依存してはならない**（逆方向のみ許可）
- mcp-server 固有の型・データ・モジュール（`data-store.ts` / JSON 等）を
  import しない
- 具象データが必要な場合は **dependency injection で受ける**
  （例: `PokemonEntryProvider`）

### ランタイム依存

- `@smogon/calc`（Gen 0 Champions 計算エンジン）と `zod` のみ許容
- それ以外の外部ライブラリは追加しない
- **publish 時の扱い**: `@smogon/calc` は npm 未 publish のため、
  mcp-server の publish 対象では tsdown が `dist/index.mjs` に bundle
  inline 化する。shared 側の import 文は変更しない

### 型依存

- `@smogon/calc` の型を `import type { ... }` で引き込むのは OK
- ただしランタイム参照は `@smogon/calc` と `zod` 以外にしない

## ディレクトリ構成

| ディレクトリ | 役割 |
|---|---|
| `constants/` | `DEFAULT_LEVEL`, `MAX_IV`, `MAX_STAT_POINT_*`, 性格補正倍率 等 |
| `utils/` | `NameResolver`（日英名変換クラス） |
| `types/` | `PokemonEntry`, `PokemonEntryProvider`, `BaseStats` 等 |
| `schemas/` | Zod 入力スキーマ（`PokemonInput`, `StatsInput` 等） |
| `analysis/` | タイプ相性・実数値計算・素早さ比較の純関数 |
| `calc/` | ダメージ計算エンジン（DI 対応の Facade + ビルダー） |

## 新規モジュール追加時のルール

- 新規サブディレクトリを作る場合は `src/index.ts` に re-export を追加
- mcp-server 側から参照する型・関数は必ず `index.ts` から export する
- テストは同階層に `*.test.ts`（コロケーション）
- テスト内で具象データ（JSON 等）を import しない。必要ならモックを作る
- マジックナンバー禁止（`constants/champions.ts` の named constant を使う）

## 既存ロジックの重複を避ける

共通処理は既に以下に集約されている:

- `analysis/type-matchup.ts`: `calculateTypeEffectiveness(gen, attackingType, defenderTypes)`
- `analysis/stat-calculator.ts`: `calculateStatValue(stat, baseStat, sp, plus, minus)`
- `analysis/speed-comparator.ts`: `compareSpeed(a, b)`
- `calc/damage-calculator.ts`: `DamageCalculatorAdapter`

新しい tool で同じ計算が必要なら、**まずここを使う**。新規に書き起こさない。
