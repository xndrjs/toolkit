import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  format: ["cjs"],
  outDir: "dist",
  platform: "node",
  target: "node24",
  dts: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  // Bundle vscode-languageclient; resolve @xndrjs/ziel at runtime (workspace / Install from Location).
  external: ["vscode", "@xndrjs/ziel"],
  noExternal: ["vscode-languageclient"],
  skipNodeModulesBundle: false,
});
