import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { isManagedGeneratedOutput } from "../compile/codegen/compose-generated-module";

/**
 * Delete stale Ziel-managed files under `outDir`: flat `resources.ts`,
 * `*.query.ts`, and a legacy barrel `index.ts` that still carry the generated
 * header and are not in `emitRelativePaths`. Never deletes hand-written or
 * nested files.
 *
 * @returns Relative paths that were removed (stable readdir order).
 */
export function removeStaleManagedOutputs(
  outDir: string,
  emitRelativePaths: ReadonlySet<string> | readonly string[]
): string[] {
  const keep = emitRelativePaths instanceof Set ? emitRelativePaths : new Set(emitRelativePaths);
  if (!existsSync(outDir)) return [];

  const deleted: string[] = [];
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const relativePath = entry.name;
    if (keep.has(relativePath)) continue;

    const absolutePath = join(outDir, relativePath);
    const content = readFileSync(absolutePath, "utf8");
    if (!isManagedGeneratedOutput(relativePath, content)) continue;

    unlinkSync(absolutePath);
    deleted.push(relativePath);
  }
  return deleted;
}
