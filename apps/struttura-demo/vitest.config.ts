import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Materialized monorepo under src/project is illustrative scaffold, not demo tests.
    exclude: ["src/project/**", "node_modules/**"],
  },
});
