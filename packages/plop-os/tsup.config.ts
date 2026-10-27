import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "tsup";

const shebang = "#!/usr/bin/env node\n";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  treeshake: true,
  splitting: false,
  dts: { entry: { index: "src/index.ts" } },
  clean: true,
  async onSuccess() {
    const cliPath = path.join("dist", "cli.js");
    const body = readFileSync(cliPath, "utf8");
    if (!body.startsWith(shebang)) {
      writeFileSync(cliPath, shebang + body, "utf8");
    }
  },
});
