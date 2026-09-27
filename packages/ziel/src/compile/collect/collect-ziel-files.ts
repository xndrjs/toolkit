import path from "node:path";
import { globSync } from "tinyglobby";

import { DEFAULT_ZIEL_EXCLUDE, DEFAULT_ZIEL_INCLUDE } from "../config/define-config";

export type CollectZielFilesOptions = {
  /** Directory to search; defaults to `process.cwd()`. */
  root?: string;
  /** Glob include patterns; defaults to {@link DEFAULT_ZIEL_INCLUDE}. */
  include?: string[];
  /** Glob exclude patterns; defaults to {@link DEFAULT_ZIEL_EXCLUDE}. */
  exclude?: string[];
  /**
   * Optional filter applied to the posix path relative to `root` after the glob.
   * A string is treated as a `RegExp` source.
   */
  pathFilter?: string | RegExp;
};

export { DEFAULT_ZIEL_EXCLUDE, DEFAULT_ZIEL_INCLUDE };

function toPosix(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function matchesPathFilter(relativePosix: string, pathFilter: string | RegExp): boolean {
  const pattern = typeof pathFilter === "string" ? new RegExp(pathFilter) : pathFilter;
  return pattern.test(relativePosix);
}

/**
 * Collect `.ziel` (or custom-glob) files under `root`.
 * Returns absolute paths in a stable lexicographic order (by relative posix path).
 */
export function collectZielFiles(options: CollectZielFilesOptions = {}): string[] {
  const root = path.resolve(options.root ?? process.cwd());
  const include = options.include ?? [...DEFAULT_ZIEL_INCLUDE];
  const exclude = options.exclude ?? [...DEFAULT_ZIEL_EXCLUDE];

  const relativePosix = globSync(include, {
    cwd: root,
    ignore: exclude,
    onlyFiles: true,
    absolute: false,
  }).map(toPosix);

  const filtered =
    options.pathFilter === undefined
      ? relativePosix
      : relativePosix.filter((rel) => matchesPathFilter(rel, options.pathFilter!));

  filtered.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return filtered.map((rel) => path.resolve(root, rel));
}
