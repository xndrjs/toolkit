import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Tests import the public package surface against source, not dist.
      "@xndrjs/forma": path.join(packageRoot, "src/index.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
