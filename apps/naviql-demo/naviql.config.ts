import { defineConfig } from "@xndrjs/naviql/compile";

export default defineConfig({
  include: ["naviql/**/*.naviql"],
  out: "./src/generated/page-detail.ts",
});
