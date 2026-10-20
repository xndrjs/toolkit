const baseConfig = require("@config/eslint").default;

/*
  To extend this configuration for some specific package/app:

  1. add lint scripts in package.json of the specific app/package
      "lint": "eslint .",
      "lint:fix": "eslint . --fix",

  2. add eslint.config.cjs configuration in the specific app/package
  // path/to/some-package/eslint.config.cjs
  const baseConfig = require("@config/eslint").default;

  module.exports = [
    ...baseConfig,
    {
      files: ["...pattern..."],
      rules: {
        ...customRules
      },
    },
  ];
 */

module.exports = [
  // Ignore generated artifacts from package builds.
  {
    ignores: [
      "**/dist/**",
      "**/.astro/**",
      "**/.next/**",
      "**/i18n/generated/**",
      "**/src/generated/**",
      // Materialized demo monorepo has its own eslint.config.js (boundaries).
      // Lint it via `pnpm --filter struttura-demo-project lint` / IDE workingDirectory.
      "apps/struttura-demo/src/project/**",
    ],
  },
  ...baseConfig,
  {
    rules: {
      "@typescript-eslint/consistent-type-definitions": "off",
    },
  },
  {
    files: ["packages/i18n/**/*.ts"],
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  // Architecture / demo harness (outside the materialization root).
  {
    files: ["apps/struttura-demo/src/architecture/**/*.{ts,tsx}", "apps/struttura-demo/src/*.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
