import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/internal.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ["zod"],
});
