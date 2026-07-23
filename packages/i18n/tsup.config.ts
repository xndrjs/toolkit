import { defineConfig } from "tsup";

const shared = {
  format: ["esm"] as const,
  outDir: "dist",
  sourcemap: true,
  treeshake: true,
  splitting: false,
  external: ["zod", "@formatjs/icu-messageformat-parser", "intl-messageformat"],
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: "src/index.ts",
      "validation/index": "src/validation/index.ts",
      "codegen/index": "src/codegen-config/index.ts",
    },
    dts: true,
    clean: true,
  },
  {
    ...shared,
    entry: {
      "cli/codegen": "src/codegen/generate-i18n-types.ts",
      "cli/audit": "src/audit/run-audit.ts",
      "cli/setup": "src/setup/setup-i18n.ts",
    },
    banner: {
      js: "#!/usr/bin/env node",
    },
    dts: false,
    clean: false,
  },
]);
