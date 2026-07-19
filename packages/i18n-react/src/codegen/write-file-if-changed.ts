import fs from "node:fs";
import path from "node:path";

/** Writes only when content changed — stable mtimes for watchers. */
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
