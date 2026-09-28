import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Writes `content` only when it differs from the current file, keeping mtimes
 * stable for downstream watchers/bundlers. Returns true when the file was written.
 */
export function writeFileIfChanged(absolutePath: string, content: string): boolean {
  if (existsSync(absolutePath)) {
    if (readFileSync(absolutePath, "utf8") === content) {
      return false;
    }
  }

  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content, "utf8");
  return true;
}
