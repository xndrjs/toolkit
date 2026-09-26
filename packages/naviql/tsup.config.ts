import { defineConfig, type Options } from "tsup";

const shared: Options = {
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  treeshake: true,
  splitting: false,
  external: [
    "@xndrjs/application-resources",
    "@xndrjs/resource-graph-resolver",
    "langium",
    /^langium\//,
    "tinyglobby",
    "jiti",
    "vscode-languageserver",
    /^vscode-languageserver\//,
    "vscode-languageserver-textdocument",
  ],
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: "src/index.ts",
      "compile/index": "src/compile/index.ts",
      "lsp/index": "src/lsp/index.ts",
    },
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
  {
    ...shared,
    entry: {
      "lsp/main": "src/lsp/main.ts",
    },
    dts: false,
    clean: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
