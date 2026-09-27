import { defineConfig } from "@xndrjs/ziel/compile";

export default defineConfig({
  include: ["ziel/**/*.ziel"],
  out: "./src/generated/ziel.ts",
});
