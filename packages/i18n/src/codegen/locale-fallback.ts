import { validateLocaleFallback } from "../resolve-locale.js";

/**
 * Union of locales found in dictionaries plus every locale referenced by `localeFallback`.
 * Drives split-by-locale partitioning and the generated locale union type.
 */
export function collectRequestLocales(
  dictionaryLocales: Set<string>,
  fallback?: Record<string, string | null>
): Set<string> {
  const all = new Set(dictionaryLocales);
  if (!fallback) {
    return all;
  }

  for (const [locale, target] of Object.entries(fallback)) {
    all.add(locale);
    if (target !== null) {
      all.add(target);
    }
  }

  return all;
}

export type LocaleFallbackIssue = {
  path: (string | number)[];
  message: string;
};

/** Pre-emit validation gate for `localeFallback` config against discovered dictionary locales. */
export function getCodegenLocaleFallbackIssues(
  fallback: Record<string, string | null>,
  dictionaryLocales: Set<string>
): LocaleFallbackIssue[] {
  const issues: LocaleFallbackIssue[] = [];

  try {
    validateLocaleFallback(fallback);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({ path: ["localeFallback"], message });
  }

  for (const [locale, target] of Object.entries(fallback)) {
    if (target !== null && !(target in fallback) && !dictionaryLocales.has(target)) {
      issues.push({
        path: ["localeFallback", locale],
        message: `localeFallback: "${locale}" points to "${target}" which is not defined in the fallback map or dictionary locales`,
      });
    }
  }

  return issues;
}

export function formatLocaleFallbackBlock(
  fallback: Record<string, string | null>,
  constName: string,
  typeName: string
): string {
  const lines = Object.entries(fallback)
    .map(
      ([locale, target]) =>
        `  ${JSON.stringify(locale)}: ${target === null ? "null" : JSON.stringify(target)},`
    )
    .join("\n");

  return (
    `export const ${constName} = {\n${lines}\n} as const satisfies Record<string, string | null>;\n\n` +
    `export type ${typeName} = typeof ${constName};\n\n`
  );
}
