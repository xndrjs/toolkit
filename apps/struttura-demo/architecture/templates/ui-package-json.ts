import { toKebabCase } from "@xndrjs/struttura";

export function uiPackageJson(name: string): string {
  const pkg = toKebabCase(name);
  return `${JSON.stringify(
    {
      name: `@ui/${pkg}`,
      private: true,
      type: "module",
      exports: { ".": "./index.ts" },
      peerDependencies: {
        react: "^19.0.0",
      },
    },
    null,
    2
  )}\n`;
}
