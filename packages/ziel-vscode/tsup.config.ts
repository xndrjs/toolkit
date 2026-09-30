import { defineConfig, type Options } from "tsup";

const shared: Options = {
  outDir: "dist",
  platform: "node",
  target: "node24",
  dts: false,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  skipNodeModulesBundle: false,
};

export default defineConfig([
  {
    ...shared,
    entry: { extension: "src/extension.ts" },
    format: ["cjs"],
    clean: true,
    external: ["vscode"],
    noExternal: ["vscode-languageclient"],
  },
  {
    ...shared,
    entry: { server: "src/server.ts" },
    format: ["cjs"],
    clean: false,
    // The VSIX must carry the complete server. Only Node built-ins remain external.
    noExternal: [/.*/],
  },
]);
