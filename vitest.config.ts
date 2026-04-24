// Vitest config for the whole monorepo
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineBaseVitestConfig } from "@config/vitest";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.join(dirname, "packages");

type ExportLeaf =
  | string
  | {
      import?: ExportLeaf;
      default?: ExportLeaf;
      module?: ExportLeaf;
      node?: ExportLeaf;
      browser?: ExportLeaf;
      development?: ExportLeaf;
      production?: ExportLeaf;
      [key: string]: ExportLeaf | undefined;
    };

interface PackageJsonLike {
  name?: string;
  exports?: ExportLeaf;
  main?: string;
  module?: string;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function resolveExportLeaf(entry: ExportLeaf | undefined): string | undefined {
  if (!entry) {
    return undefined;
  }
  if (typeof entry === "string") {
    return entry;
  }
  return (
    resolveExportLeaf(entry.import) ??
    resolveExportLeaf(entry.default) ??
    resolveExportLeaf(entry.module) ??
    resolveExportLeaf(entry.node) ??
    resolveExportLeaf(entry.browser) ??
    resolveExportLeaf(entry.development) ??
    resolveExportLeaf(entry.production)
  );
}

function candidateSourcePaths(packageRoot: string, runtimeEntry: string): string[] {
  const clean = runtimeEntry.startsWith("./") ? runtimeEntry.slice(2) : runtimeEntry;
  if (clean.includes("*")) {
    return [];
  }

  const candidates = new Set<string>();
  const sourceLike = clean.replace(/^dist\//, "src/");

  const withoutJsExt = sourceLike.replace(/\.(mjs|cjs|js)$/, "");
  candidates.add(path.join(packageRoot, `${withoutJsExt}.ts`));
  candidates.add(path.join(packageRoot, `${withoutJsExt}.tsx`));
  candidates.add(path.join(packageRoot, sourceLike));

  if (withoutJsExt.endsWith("/index")) {
    const baseDir = withoutJsExt.slice(0, -"/index".length);
    candidates.add(path.join(packageRoot, `${baseDir}.ts`));
    candidates.add(path.join(packageRoot, `${baseDir}.tsx`));
  } else {
    candidates.add(path.join(packageRoot, withoutJsExt, "index.ts"));
    candidates.add(path.join(packageRoot, withoutJsExt, "index.tsx"));
  }

  return [...candidates];
}

function resolveSourceEntry(packageRoot: string, runtimeEntry: string): string | undefined {
  const candidates = candidateSourcePaths(packageRoot, runtimeEntry);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function collectWorkspaceAliases(): Record<string, string> {
  const aliases: Record<string, string> = {};
  const packageDirs = fs.readdirSync(packagesDir, { withFileTypes: true });

  for (const dir of packageDirs) {
    if (!dir.isDirectory()) {
      continue;
    }

    const packageRoot = path.join(packagesDir, dir.name);
    const packageJsonPath = path.join(packageRoot, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJsonLike;
    if (typeof packageJson.name !== "string" || !packageJson.name.startsWith("@xndrjs/")) {
      continue;
    }

    if (packageJson.exports && typeof packageJson.exports === "object") {
      for (const [key, value] of Object.entries(packageJson.exports)) {
        const runtimeEntry = resolveExportLeaf(value);
        if (!runtimeEntry) {
          continue;
        }
        const sourceEntry = resolveSourceEntry(packageRoot, runtimeEntry);
        if (!sourceEntry) {
          continue;
        }

        if (key === ".") {
          aliases[packageJson.name] = sourceEntry;
          continue;
        }
        if (key.startsWith("./") && !key.includes("*")) {
          aliases[`${packageJson.name}/${key.slice(2)}`] = sourceEntry;
        }
      }
    }

    if (!aliases[packageJson.name]) {
      const fallbackRuntimeEntry = packageJson.module ?? packageJson.main;
      if (fallbackRuntimeEntry) {
        const sourceEntry = resolveSourceEntry(packageRoot, fallbackRuntimeEntry);
        if (sourceEntry) {
          aliases[packageJson.name] = sourceEntry;
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(aliases).map(([alias, target]) => [alias, toPosixPath(target)])
  );
}

const workspaceAliases = collectWorkspaceAliases();

export default defineBaseVitestConfig({
  test: {
    include: ["**/*.test.ts"],
  },
  resolve: {
    alias: {
      ...workspaceAliases,
    },
  },
});
