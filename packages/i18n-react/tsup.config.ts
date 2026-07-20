import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "tsup";

const useClientBanner = '"use client";';

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  banner: {
    js: useClientBanner,
  },
  external: ["react", "react-dom", "@xndrjs/i18n"],
  async onSuccess() {
    const distDir = path.join(process.cwd(), "dist");
    for (const file of fs.readdirSync(distDir)) {
      if (!file.endsWith(".js")) {
        continue;
      }
      const filePath = path.join(distDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      if (!content.startsWith(useClientBanner)) {
        fs.writeFileSync(filePath, `${useClientBanner}\n${content}`);
      }
    }
  },
});
