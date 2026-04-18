import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const DIST_TEST_TIMEOUT_MS = 30_000;

export default defineConfig({
  resolve: {
    alias: {
      "@data": resolve(import.meta.dirname, "data/champions"),
      "@ai-rotom/shared": resolve(import.meta.dirname, "shared/src/index.ts"),
    },
  },
  test: {
    globals: true,
    include: ["packages/mcp-server/tests/dist/**/*.test.ts"],
    testTimeout: DIST_TEST_TIMEOUT_MS,
    hookTimeout: DIST_TEST_TIMEOUT_MS,
    // dist smoke test は子プロセス (node dist/index.mjs) を spawn するため、
    // 並列にテストファイルを走らせると stdio / ポート等で干渉しやすい。
    // Vitest 4 で `poolOptions.forks.singleFork` は非推奨化されたため、
    // 後継の top-level `fileParallelism: false` で直列実行を担保する。
    fileParallelism: false,
  },
});
