import type { NormalizedDictionary } from "./types.js";

type LocaleDictionary = Record<string, string>;
type KeyDictionary = Record<string, LocaleDictionary>;
type MultiDictionary = Record<string, KeyDictionary>;

export function toDictionary(normalized: NormalizedDictionary): KeyDictionary | MultiDictionary {
  if (normalized.mode === "single") {
    const dictionary: KeyDictionary = {};

    for (const [key, entry] of Object.entries(normalized.keys)) {
      const locales: LocaleDictionary = {};
      for (const [locale, localeEntry] of Object.entries(entry.locales)) {
        locales[locale] = localeEntry.template;
      }
      dictionary[key] = locales;
    }

    return dictionary;
  }

  const dictionary: MultiDictionary = {};

  for (const [namespace, keys] of Object.entries(normalized.namespaces)) {
    const namespaceDictionary: KeyDictionary = {};

    for (const [key, entry] of Object.entries(keys)) {
      const locales: LocaleDictionary = {};
      for (const [locale, localeEntry] of Object.entries(entry.locales)) {
        locales[locale] = localeEntry.template;
      }
      namespaceDictionary[key] = locales;
    }

    dictionary[namespace] = namespaceDictionary;
  }

  return dictionary;
}

export function toNamespaceDictionary(
  normalized: NormalizedDictionary,
  namespace: string
): KeyDictionary {
  if (normalized.mode !== "multi") {
    throw new Error(
      `[i18n] toNamespaceDictionary requires multi-mode normalized dictionary, got "${normalized.mode}"`
    );
  }

  const keys = normalized.namespaces[namespace];
  if (!keys) {
    return {};
  }

  const dictionary: KeyDictionary = {};

  for (const [key, entry] of Object.entries(keys)) {
    const locales: LocaleDictionary = {};
    for (const [locale, localeEntry] of Object.entries(entry.locales)) {
      locales[locale] = localeEntry.template;
    }
    dictionary[key] = locales;
  }

  return dictionary;
}
