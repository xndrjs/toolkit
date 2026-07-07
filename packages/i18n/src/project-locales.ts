import { resolveLocaleTemplate } from "./resolve-locale.js";
import type { KeyDictionary, LocaleFallbackMap, MultiDictionary } from "./types.js";

function projectKeyDictionary<T extends KeyDictionary>(
  dictionary: T,
  locales: readonly string[],
  localeFallback?: LocaleFallbackMap
): T {
  const targetLocales = [...new Set(locales)];
  const result = {} as T;

  for (const [key, localesByKey] of Object.entries(dictionary)) {
    const projected: Record<string, string> = {};

    for (const locale of targetLocales) {
      const resolved = resolveLocaleTemplate(localesByKey, locale, localeFallback);
      if (resolved !== undefined) {
        projected[locale] = resolved.template;
      }
    }

    if (Object.keys(projected).length > 0) {
      result[key as keyof T] = projected as T[keyof T];
    }
  }

  return result;
}

/**
 * Builds a dictionary that contains only the requested locales.
 * For each key and target locale, copies the direct template when present;
 * otherwise resolves through `localeFallback` (same rules as `.get()` at runtime).
 */
export function projectLocales<T extends KeyDictionary>(
  dictionary: T,
  locales: readonly string[],
  localeFallback?: LocaleFallbackMap
): T {
  return projectKeyDictionary(dictionary, locales, localeFallback);
}

/**
 * Projects every namespace in a multi-namespace dictionary.
 */
export function projectNamespacesLocales<T extends MultiDictionary>(
  dictionary: T,
  locales: readonly string[],
  localeFallback?: LocaleFallbackMap
): T {
  const result = {} as T;

  for (const namespace of Object.keys(dictionary) as (keyof T & string)[]) {
    const namespaceDictionary = dictionary[namespace];
    if (namespaceDictionary === undefined) {
      continue;
    }

    result[namespace] = projectKeyDictionary(
      namespaceDictionary,
      locales,
      localeFallback
    ) as T[typeof namespace];
  }

  return result;
}
