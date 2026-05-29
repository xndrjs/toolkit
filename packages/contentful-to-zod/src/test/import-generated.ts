import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** Dynamically import a generated TypeScript module string (for helper runtime tests). */
export async function importGeneratedModule<T extends Record<string, unknown>>(
  source: string
): Promise<T> {
  // Keep temp files under the package so Node can resolve peer/dev deps (e.g. `zod`).
  const dir = mkdtempSync(join(packageRoot, ".vitest-generated-"));
  const filePath = join(dir, "generated.ts");

  writeFileSync(filePath, source);

  try {
    return (await import(pathToFileURL(filePath).href)) as T;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
