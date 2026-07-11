import fs from "node:fs";
import path from "node:path";

/**
 * Writes `content` to `absolutePath` only when it differs from the current
 * file content, keeping mtimes stable for downstream watchers/bundlers.
 * Returns true when the file was actually written.
 */
export function writeFileIfChanged(absolutePath: string, content: string): boolean {
  if (fs.existsSync(absolutePath)) {
    const currentContent = fs.readFileSync(absolutePath, "utf8");
    if (currentContent === content) {
      return false;
    }
  }

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
  return true;
}
