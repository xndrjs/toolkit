import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Paths created by the walkthrough (must match .gitignore). */
export const GENERATED = ["packages", "apps", "notes", "CATALOG.md"];

export const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Remove walkthrough output from the demo filesystem. */
export function clearGenerated(root = demoRoot) {
  const removed = [];
  for (const name of GENERATED) {
    const target = path.join(root, name);
    if (!existsSync(target)) continue;
    rmSync(target, { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}
