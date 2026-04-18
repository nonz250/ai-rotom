import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  // @smogon/calc は npm に未 publish のため bundle inline 化
  deps: {
    alwaysBundle: ["@smogon/calc"],
  },
});
