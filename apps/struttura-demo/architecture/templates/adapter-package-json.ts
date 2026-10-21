import { toKebabCase } from "@xndrjs/struttura";

export function adapterPackageJson(input: {
  name: string;
  feature: string;
  vendor: string;
}): string {
  const pkg = toKebabCase(input.name);
  const feature = toKebabCase(input.feature);
  const vendor = toKebabCase(input.vendor);
  return `${JSON.stringify(
    {
      name: `@adapter/${pkg}`,
      private: true,
      type: "module",
      exports: { ".": "./index.ts" },
      dependencies: {
        [`@core/${feature}`]: "workspace:*",
        [`@infrastructure/${vendor}`]: "workspace:*",
      },
    },
    null,
    2
  )}\n`;
}
