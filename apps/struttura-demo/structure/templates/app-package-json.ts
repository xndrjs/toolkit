import { toKebabCase } from "@xndrjs/struttura";

export function appPackageJson(name: string): string {
  const app = toKebabCase(name);
  return `${JSON.stringify(
    {
      name: app,
      private: true,
      type: "module",
      dependencies: {
        "server-only": "^0.0.1",
      },
    },
    null,
    2
  )}\n`;
}
