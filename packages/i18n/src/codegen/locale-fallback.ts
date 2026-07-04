import { validateLocaleFallback } from "../resolve-locale.js";

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

export function validateCodegenLocaleFallback(
  fallback: Record<string, string | null>,
  dictionaryLocales: Set<string>
): boolean {
  let hasErrors = false;

  try {
    validateLocaleFallback(fallback);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Codegen Error] ${message}`);
    hasErrors = true;
  }

  for (const [locale, target] of Object.entries(fallback)) {
    if (target !== null && !(target in fallback) && !dictionaryLocales.has(target)) {
      console.error(
        `[Codegen Error] localeFallback: "${locale}" points to "${target}" which is not defined in the fallback map or dictionary locales`
      );
      hasErrors = true;
    }
  }

  return hasErrors;
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
