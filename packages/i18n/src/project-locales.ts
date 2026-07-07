import { resolveLocaleTemplate } from "./resolve-locale.js";
import type { KeyDictionary, LocaleFallbackMap } from "./types.js";

/**
 * Builds a dictionary that contains only the requested locales.
 * For each key and target locale, copies the direct template when present;
 * otherwise resolves through `localeFallback` (same rules as `.get()` at runtime).
 */
export function projectLocales(
  dictionary: KeyDictionary,
  locales: readonly string[],
  localeFallback?: LocaleFallbackMap
): KeyDictionary {
  const targetLocales = [...new Set(locales)];
  const result: KeyDictionary = {};

  for (const [key, localesByKey] of Object.entries(dictionary)) {
    const projected: Record<string, string> = {};

    for (const locale of targetLocales) {
      const resolved = resolveLocaleTemplate(localesByKey, locale, localeFallback);
      if (resolved !== undefined) {
        projected[locale] = resolved.template;
      }
    }

    if (Object.keys(projected).length > 0) {
      result[key] = projected;
    }
  }

  return result;
}
