import { readdir } from "node:fs/promises";
import path from "node:path";

import { toPosixPath } from "./glob";

const DEFAULT_EXCLUDED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".nuxt",
  ".nx",
  ".output",
  ".svelte-kit",
  ".turbo",
  ".vite",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "temp",
  "tmp",
]);

const DEFAULT_EXCLUDED_FILES = new Set([".DS_Store", ".eslintcache", "Thumbs.db"]);

export async function collectFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!DEFAULT_EXCLUDED_DIRECTORIES.has(entry.name)) {
          await visit(path.join(directory, entry.name));
        }
        continue;
      }

      if (entry.isFile() && !shouldSkipFile(entry.name)) {
        files.push(toPosixPath(path.relative(rootDir, path.join(directory, entry.name))));
      }
    }
  }

  await visit(rootDir);

  return files.sort();
}

function shouldSkipFile(fileName: string): boolean {
  return DEFAULT_EXCLUDED_FILES.has(fileName) || fileName.endsWith(".tsbuildinfo");
}
