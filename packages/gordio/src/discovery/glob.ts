import path from "node:path";

export function normalizePatterns(patterns: string | string[] | undefined): string[] {
  if (!patterns) {
    return [];
  }

  return Array.isArray(patterns) ? patterns : [patterns];
}

export function matchesAny(relativePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(toPosixPath(pattern)).test(relativePath));
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];

    if (char === undefined) {
      break;
    }

    if (char === "*" && next === "*") {
      if (afterNext === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += escapeRegExp(char);
  }

  return new RegExp(`${source}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
