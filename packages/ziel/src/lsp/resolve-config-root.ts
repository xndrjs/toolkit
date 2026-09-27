/**
 * Walk up from a document path to find `ziel.config.ts` / `.js` / `.mjs`.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const CONFIG_NAMES = ["ziel.config.ts", "ziel.config.js", "ziel.config.mjs"] as const;

/**
 * Return the absolute path of the nearest Ziel config file, or `undefined`.
 */
export function findZielConfigFile(startDir: string): string | undefined {
  let dir = startDir;
  for (;;) {
    for (const name of CONFIG_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}
