import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["demo.test.ts"],
    // src is the materialized monorepo, not the demo test suite.
    exclude: ["src/**", "node_modules/**"],
  },
});
