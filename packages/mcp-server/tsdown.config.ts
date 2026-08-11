import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  // bin 専用パッケージで型定義は誰も参照しない。加えて TypeScript 7 では
  // dts 生成が tsgo 起動に切り替わり、tsconfig の rootDir を無視して
  // パッケージ直下を rootDir 扱いするため、その外にある shared/src へ
  // .d.ts を撒き散らす。tsconfig の declaration: true による暗黙有効化を止める。
  dts: false,
  // dts を切ると道連れで消えるため明示する（dts プラグインが rolldown 側の
  // sourcemap も有効化していた）。
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  // @smogon/calc は npm 未 publish のため bundle inline 化。
  // @pokesol/pokesol-text-parser-ts は ESM-only / ランタイム依存ゼロ。
  // publish 物の dependencies に含めず dist にインライン化する方針。
  deps: {
    alwaysBundle: ["@smogon/calc", "@pokesol/pokesol-text-parser-ts"],
  },
});
