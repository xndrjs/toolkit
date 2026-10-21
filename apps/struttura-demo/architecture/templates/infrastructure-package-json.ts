import { toKebabCase } from "@xndrjs/struttura";

export function infrastructurePackageJson(name: string): string {
  const pkg = toKebabCase(name);
  return `${JSON.stringify(
    {
      name: `@infrastructure/${pkg}`,
      private: true,
      type: "module",
      exports: { ".": "./index.ts" },
    },
    null,
    2
  )}\n`;
}
