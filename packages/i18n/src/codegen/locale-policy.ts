import { collectRequestLocales } from "./locale-fallback.js";

export function buildRequiredLocales(
  dictionaryLocales: Set<string>,
  configFallback?: Record<string, string | null>
): string[] {
  return [...collectRequestLocales(dictionaryLocales, configFallback)].sort();
}

export function enrichLocaleFallback(
  dictionaryLocales: Set<string>,
  configFallback: Record<string, string | null>
): Record<string, string | null> {
  const enriched: Record<string, string | null> = { ...configFallback };

  for (const locale of buildRequiredLocales(dictionaryLocales, configFallback)) {
    if (!(locale in enriched)) {
      enriched[locale] = null;
    }
  }

  const sortedEntries = Object.entries(enriched).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  return Object.fromEntries(sortedEntries);
}
