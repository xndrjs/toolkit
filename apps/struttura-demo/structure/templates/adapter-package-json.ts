import { toKebabCase } from "@xndrjs/struttura";

export function adapterPackageJson(input: { name: string; feature: string }): string {
  const pkg = toKebabCase(input.name);
  const feature = toKebabCase(input.feature);
  return `${JSON.stringify(
    {
      name: `@adapter/${pkg}`,
      private: true,
      type: "module",
      exports: { ".": "./index.ts" },
      dependencies: {
        [`@core/${feature}`]: "workspace:*",
        // Author @infrastructure/* deps as needed (may be more than one).
      },
    },
    null,
    2
  )}\n`;
}
