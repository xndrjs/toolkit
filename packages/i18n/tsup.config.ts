import { defineConfig } from "tsup";

const shared = {
  format: ["esm"] as const,
  outDir: "dist",
  sourcemap: true,
  treeshake: true,
  splitting: false,
  external: ["zod", "@formatjs/icu-messageformat-parser", "intl-messageformat"],
};

export default defineConfig({
  ...shared,
  entry: {
    index: "src/index.ts",
    "validation/index": "src/validation/index.ts",
  },
  dts: true,
  clean: true,
});
