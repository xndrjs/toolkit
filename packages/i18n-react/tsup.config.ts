import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "tsup";

const useClientBanner = '"use client";';

const shared = {
  format: ["esm"] as const,
  outDir: "dist",
  sourcemap: true,
  clean: false,
  treeshake: true,
  splitting: false,
  external: ["react", "react-dom", "@xndrjs/i18n", "zod"],
};

export default defineConfig([
  {
    ...shared,
    entry: ["src/index.ts"],
    dts: true,
    clean: true,
    banner: {
      js: useClientBanner,
    },
    async onSuccess() {
      const distDir = path.join(process.cwd(), "dist");
      for (const file of fs.readdirSync(distDir)) {
        if (!file.endsWith(".js") || file.startsWith("cli/")) {
          continue;
        }
        const filePath = path.join(distDir, file);
        const content = fs.readFileSync(filePath, "utf8");
        if (!content.startsWith(useClientBanner)) {
          fs.writeFileSync(filePath, `${useClientBanner}\n${content}`);
        }
      }
    },
  },
  {
    ...shared,
    entry: {
      "cli/codegen": "src/codegen/generate-react-bindings.ts",
    },
    banner: {
      js: "#!/usr/bin/env node",
    },
    dts: false,
  },
]);
