export function workspacePackageJson(): string {
  return `${JSON.stringify(
    {
      name: "struttura-demo-project",
      private: true,
      type: "module",
      scripts: {
        typecheck: "tsc -b",
        test: "vitest run",
        lint: "eslint .",
      },
      devDependencies: {
        eslint: "^9.17.0",
        "eslint-import-resolver-typescript": "^4.4.4",
        "eslint-plugin-boundaries": "^6.0.2",
        "typescript-eslint": "^8.18.0",
      },
    },
    null,
    2
  )}\n`;
}
