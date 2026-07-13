import { mergeVariableMetaAcrossLocales, type VariableMetaSpec } from "./icu/extract-variables.js";
import { parseTemplate } from "./icu/parse-template.js";
import type { KeyDictionary, PartialKeyDictionary } from "./types.js";

export function preloadKeySingle(key: string, locale: string): string {
  return `${key}:${locale}`;
}

export function preloadKeyMulti(namespace: string, key: string, locale: string): string {
  return `${namespace}:${key}:${locale}`;
}

export function seedPreloadedKeysSingle(
  dictionary: KeyDictionary,
  preloadedKeys: Set<string>
): void {
  for (const [key, localeByKey] of Object.entries(dictionary)) {
    if (localeByKey === undefined || typeof localeByKey !== "object") {
      continue;
    }
    for (const locale of Object.keys(localeByKey)) {
      preloadedKeys.add(preloadKeySingle(key, locale));
    }
  }
}

export function seedPreloadedKeysMulti(
  dictionary: Record<string, KeyDictionary>,
  preloadedKeys: Set<string>
): void {
  for (const [namespace, keyDictionary] of Object.entries(dictionary)) {
    if (keyDictionary === undefined || typeof keyDictionary !== "object") {
      continue;
    }
    for (const [key, localeByKey] of Object.entries(keyDictionary)) {
      if (localeByKey === undefined || typeof localeByKey !== "object") {
        continue;
      }
      for (const locale of Object.keys(localeByKey)) {
        preloadedKeys.add(preloadKeyMulti(namespace, key, locale));
      }
    }
  }
}

export function recordPreloadedKeysSingle(
  partial: PartialKeyDictionary<KeyDictionary, string>,
  preloadedKeys: Set<string>
): void {
  for (const [key, incomingLocales] of Object.entries(partial)) {
    if (incomingLocales === undefined || typeof incomingLocales !== "object") {
      continue;
    }
    for (const locale of Object.keys(incomingLocales)) {
      preloadedKeys.add(preloadKeySingle(key, locale));
    }
  }
}

export function recordPreloadedKeysMulti(
  namespace: string,
  partial: PartialKeyDictionary<KeyDictionary, string>,
  preloadedKeys: Set<string>
): void {
  for (const [key, incomingLocales] of Object.entries(partial)) {
    if (incomingLocales === undefined || typeof incomingLocales !== "object") {
      continue;
    }
    for (const locale of Object.keys(incomingLocales)) {
      preloadedKeys.add(preloadKeyMulti(namespace, key, locale));
    }
  }
}

function collectLocaleMetasForKey(
  localeByKey: Record<string, string>,
  patchedLocale: string,
  patchedMeta: VariableMetaSpec
): VariableMetaSpec[] {
  const localeMetas: VariableMetaSpec[] = [patchedMeta];

  for (const [locale, template] of Object.entries(localeByKey)) {
    if (locale === patchedLocale) {
      continue;
    }
    const parsed = parseTemplate(template);
    if (parsed.ok) {
      localeMetas.push(parsed.meta);
    }
  }

  return localeMetas;
}

export function assertPatchKeySingle(
  key: string,
  locale: string,
  template: string,
  preloadedKeys: Set<string>,
  localeByKey: Record<string, string> | undefined
): void {
  if (!preloadedKeys.has(preloadKeySingle(key, locale))) {
    throw new Error(`[i18n] Key not preloaded: ${key} (${locale})`);
  }

  const parsed = parseTemplate(template);
  if (!parsed.ok) {
    throw new Error(`[i18n] ICU syntax error on patch: ${parsed.message}`);
  }

  const localeMetas = collectLocaleMetasForKey(localeByKey ?? {}, locale, parsed.meta);
  const merged = mergeVariableMetaAcrossLocales(localeMetas);
  if (!merged.ok) {
    throw new Error(`[i18n] ICU args mismatch on patch: ${merged.message}`);
  }
}

export function assertPatchKeyMulti(
  namespace: string,
  key: string,
  locale: string,
  template: string,
  preloadedKeys: Set<string>,
  localeByKey: Record<string, string> | undefined
): void {
  if (!preloadedKeys.has(preloadKeyMulti(namespace, key, locale))) {
    throw new Error(`[i18n] Key not preloaded: ${namespace}.${key} (${locale})`);
  }

  const parsed = parseTemplate(template);
  if (!parsed.ok) {
    throw new Error(`[i18n] ICU syntax error on patch: ${parsed.message}`);
  }

  const localeMetas = collectLocaleMetasForKey(localeByKey ?? {}, locale, parsed.meta);
  const merged = mergeVariableMetaAcrossLocales(localeMetas);
  if (!merged.ok) {
    throw new Error(`[i18n] ICU args mismatch on patch: ${merged.message}`);
  }
}
