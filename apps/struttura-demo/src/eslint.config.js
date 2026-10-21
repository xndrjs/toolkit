import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

import { architectureBoundariesConfig } from "./eslint.boundaries.mjs";

const boundariesBlock = architectureBoundariesConfig(boundaries);

/** Authored entry — compose boundaries with local overrides. */
export default [
  {
    ignores: ["node_modules/**", "**/dist/**"],
  },
  {
    ...boundariesBlock,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
      },
    },
  },
];
