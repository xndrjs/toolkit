// Vitest config for the whole monorepo
import { defineBaseVitestConfig } from "@config/vitest";

export default defineBaseVitestConfig({
  test: {
    include: ["**/*.test.ts"],
  },
});
