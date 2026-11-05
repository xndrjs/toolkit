import fs from "node:fs/promises";
import path from "node:path";

import { latestDocPrefix } from "../../doc-routing.mjs";

const latestDocsRoot = path.resolve(process.cwd(), "src/content/docs", latestDocPrefix);

async function listDocFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listDocFiles(fullPath);
      if (!entry.isFile()) return [];
      if (!entry.name.endsWith(".md") && !entry.name.endsWith(".mdx")) return [];
      return [fullPath];
    })
  );
  return files.flat();
}

export async function getLatestDocTailSlugs(): Promise<string[]> {
  const files = await listDocFiles(latestDocsRoot);
  const slugs = files
    .map((absolutePath) => {
      const relative = path.relative(latestDocsRoot, absolutePath);
      const extensionless = relative.replace(/\.(md|mdx)$/u, "").replace(/\\/gu, "/");
      if (extensionless === "index") return "";
      return extensionless.endsWith("/index")
        ? extensionless.slice(0, -"/index".length)
        : extensionless;
    })
    .filter((slug) => slug.length > 0);

  return [...new Set(slugs)].sort();
}
