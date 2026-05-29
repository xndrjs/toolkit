import { defineConfig } from "tsup";

const shared = {
  format: ["esm"] as const,
  outDir: "dist",
  sourcemap: true,
  treeshake: true,
  splitting: false,
  external: ["zod", "contentful-management"],
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/index.ts"],
    dts: true,
    clean: true,
  },
  {
    ...shared,
    entry: ["src/cli.ts"],
    dts: false,
    clean: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
