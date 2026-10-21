import { toKebabCase } from "@xndrjs/struttura";

export function corePackageJson(name: string): string {
  const feature = toKebabCase(name);
  return `${JSON.stringify(
    {
      name: `@core/${feature}`,
      private: true,
      type: "module",
      exports: {
        "./models": "./models/index.ts",
        "./operations": "./operations/index.ts",
        "./use-cases": "./use-cases/index.ts",
        "./ports": "./ports/index.ts",
        "./errors": "./errors/index.ts",
      },
      sideEffects: false,
      dependencies: {
        "@xndrjs/domain": "workspace:*",
        "@xndrjs/domain-zod": "workspace:*",
        zod: "^4.0.0",
      },
    },
    null,
    2
  )}\n`;
}
