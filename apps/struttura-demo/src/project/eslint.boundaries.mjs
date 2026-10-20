/** Authored boundaries matrix (parity with xndrjs-monorepo). Edit this file by hand. */

export function architectureBoundariesConfig(boundaries) {
  return {
    files: ["apps/**/*.{js,mjs,cjs,ts,tsx}", "packages/**/*.{js,mjs,cjs,ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["apps/**/*", "packages/**/*"],
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./tsconfig.eslint.json"],
        },
      },
      "boundaries/elements": [
        {
          type: "app-composition",
          mode: "folder",
          pattern: "apps/*/composition",
          capture: ["app"],
        },
        {
          type: "app",
          mode: "folder",
          pattern: "apps/*",
          capture: ["app"],
        },
        {
          type: "core-errors",
          mode: "folder",
          pattern: "packages/core-*/errors",
          capture: ["feature"],
        },
        {
          type: "core-models",
          mode: "folder",
          pattern: "packages/core-*/models",
          capture: ["feature"],
        },
        {
          type: "core-operations",
          mode: "folder",
          pattern: "packages/core-*/operations",
          capture: ["feature"],
        },
        {
          type: "core-use-cases",
          mode: "folder",
          pattern: "packages/core-*/use-cases",
          capture: ["feature"],
        },
        {
          type: "core-ports",
          mode: "folder",
          pattern: "packages/core-*/ports",
          capture: ["feature"],
        },
        {
          type: "infrastructure",
          mode: "folder",
          pattern: "packages/infrastructure-*",
          capture: ["infrastructure"],
        },
        {
          type: "ui",
          mode: "folder",
          pattern: "packages/ui-*",
          capture: ["ui"],
        },
      ],
    },
    rules: {
      "boundaries/no-unknown": "warn",
      "boundaries/no-unknown-files": "warn",
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          rules: [
            {
              from: { type: "app-composition" },
              allow: {
                to: {
                  type: [
                    "app",
                    "app-composition",
                    "core-models",
                    "core-operations",
                    "core-use-cases",
                    "core-ports",
                    "core-errors",
                    "infrastructure",
                    "ui",
                  ],
                },
              },
            },
            {
              from: { type: "app" },
              allow: {
                to: {
                  type: [
                    "app",
                    "app-composition",
                    "core-models",
                    "core-ports",
                    "core-errors",
                    "ui",
                  ],
                },
              },
            },
            {
              from: { type: "app" },
              allow: {
                to: { type: "core-use-cases" },
                dependency: { kind: "type" },
              },
            },
            {
              from: { type: "core-errors" },
              allow: { to: { type: "core-errors" } },
            },
            {
              from: { type: "core-models" },
              allow: {
                to: { type: ["core-models", "core-errors"] },
              },
            },
            {
              from: { type: "core-operations" },
              allow: {
                to: {
                  type: ["core-models", "core-operations", "core-errors"],
                },
              },
            },
            {
              from: { type: "core-ports" },
              allow: {
                to: { type: ["core-models", "core-ports", "core-errors"] },
              },
            },
            {
              from: { type: "core-use-cases" },
              allow: {
                to: {
                  type: [
                    "core-models",
                    "core-operations",
                    "core-ports",
                    "core-use-cases",
                    "core-errors",
                  ],
                },
              },
            },
            {
              from: { type: "infrastructure" },
              allow: {
                to: {
                  type: ["core-models", "core-ports", "core-errors", "infrastructure"],
                },
              },
            },
            {
              from: { type: "ui" },
              allow: { to: { type: "ui" } },
            },
          ],
        },
      ],
    },
  };
}
