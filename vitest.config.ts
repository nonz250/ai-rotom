import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@data": resolve(import.meta.dirname, "data/champions"),
      "@ai-rotom/shared": resolve(import.meta.dirname, "packages/shared/src/index.ts"),
    },
  },
  test: {
    globals: true,
    include: ["packages/*/src/**/*.test.ts"],
  },
});
