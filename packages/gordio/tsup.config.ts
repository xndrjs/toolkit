import { defineConfig, type Options } from "tsup";

const shared: Options = {
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
  treeshake: true,
  splitting: false,
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
  {
    ...shared,
    entry: {
      viewer: "src/viewer/client/main.tsx",
    },
    outDir: "dist/viewer",
    dts: false,
    clean: false,
    platform: "browser",
    noExternal: ["@xyflow/react", "react", "react-dom"],
  },
]);
