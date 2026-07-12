import { resolveLocaleTemplate } from "./resolve-locale.js";
import type { KeyDictionary, LocaleFallbackMap, MultiDictionary } from "./types.js";

function classifyAreaLocales(
  areaLocales: readonly string[],
  localeFallback?: LocaleFallbackMap
): { full: string[]; preserve: string[] } {
  const areaSet = new Set(areaLocales);
  const full: string[] = [];
  const preserve: string[] = [];

  for (const locale of areaLocales) {
    const fallback = localeFallback?.[locale];
    if (fallback !== null && fallback !== undefined && areaSet.has(fallback)) {
      preserve.push(locale);
    } else {
      full.push(locale);
    }
  }

  return { full, preserve };
}

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
 * Builds a namespace dictionary that contains only the requested locales.
 * For each key and target locale, copies the direct template when present;
 * otherwise resolves through `localeFallback` (same rules as `.get()` at runtime).
 */
export function projectNamespaceLocalesCore<T extends KeyDictionary>(
  dictionary: T,
  locales: readonly string[],
  localeFallback?: LocaleFallbackMap
): T {
  return projectKeyDictionary(dictionary, locales, localeFallback);
}

/**
 * Projects a single namespace for a custom delivery area.
 * Full locales resolve through `localeFallback` (e.g. external chains like `it → en-US`);
 * preserve locales copy only their direct canonical entry when present.
 */
export function projectNamespaceForDeliveryAreaCore<T extends KeyDictionary>(
  dictionary: T,
  areaLocales: readonly string[],
  localeFallback?: LocaleFallbackMap
): T {
  const { full, preserve } = classifyAreaLocales(areaLocales, localeFallback);
  const fullProjection =
    full.length > 0 ? projectKeyDictionary(dictionary, full, localeFallback) : undefined;
  const result = {} as T;

  for (const [key, localesByKey] of Object.entries(dictionary)) {
    const projected: Record<string, string> = {};

    if (fullProjection !== undefined) {
      const fullEntry = fullProjection[key as keyof T];
      if (fullEntry !== undefined) {
        Object.assign(projected, fullEntry);
      }
    }

    for (const locale of preserve) {
      const template = localesByKey[locale];
      if (template !== undefined) {
        projected[locale] = template;
      }
    }

    if (Object.keys(projected).length > 0) {
      result[key as keyof T] = projected as T[keyof T];
    }
  }

  return result;
}

/**
 * Projects a multi-namespace dictionary for a custom delivery area.
 * Each namespace uses the same delivery-area rules as `projectNamespaceForDeliveryAreaCore`.
 */
export function projectDictionaryForDeliveryAreaCore<T extends MultiDictionary>(
  dictionary: T,
  areaLocales: readonly string[],
  localeFallback?: LocaleFallbackMap
): T {
  const result = {} as T;

  for (const namespace of Object.keys(dictionary) as (keyof T & string)[]) {
    const namespaceDictionary = dictionary[namespace];
    if (namespaceDictionary === undefined) {
      continue;
    }

    result[namespace] = projectNamespaceForDeliveryAreaCore(
      namespaceDictionary,
      areaLocales,
      localeFallback
    ) as T[typeof namespace];
  }

  return result;
}

/**
 * Projects every namespace in a multi-namespace dictionary.
 */
export function projectDictionaryLocalesCore<T extends MultiDictionary>(
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

/**
 * Merges locale entries per translation key without dropping keys or locales
 * already present in `existing`. Incoming locales overwrite the same locale on conflict.
 */
export function mergeNamespaceLocalesCore<T extends KeyDictionary>(existing: T, incoming: T): T {
  const merged = structuredClone(existing);

  for (const [key, incomingLocales] of Object.entries(incoming)) {
    if (incomingLocales === undefined || typeof incomingLocales !== "object") {
      continue;
    }

    merged[key as keyof T] = {
      ...(merged[key as keyof T] ?? {}),
      ...incomingLocales,
    } as T[keyof T];
  }

  return merged;
}
