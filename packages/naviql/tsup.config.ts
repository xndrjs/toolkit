import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "compile/index": "src/compile/index.ts",
  },
  format: ["esm"],
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: [
    "@xndrjs/application-resources",
    "@xndrjs/resource-graph-resolver",
    "langium",
    /^langium\//,
    "tinyglobby",
  ],
});
