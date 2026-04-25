import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
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
