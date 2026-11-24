import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@data": resolve(import.meta.dirname, "data/champions"),
      "@ai-rotom/shared": resolve(import.meta.dirname, "shared/src/index.ts"),
      "@ai-rotom/mcp-core": resolve(import.meta.dirname, "packages/mcp-server/src/core.ts"),
    },
  },
  test: {
    globals: true,
    include: [
      "packages/*/src/**/*.test.ts",
      "shared/src/**/*.test.ts",
    ],
  },
});
