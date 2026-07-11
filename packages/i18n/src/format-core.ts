import { IntlMessageFormat } from "intl-messageformat";
import { formatLocaleFallbackChain, resolveLocaleTemplate } from "./resolve-locale.js";
import type { LocaleCache, LocaleFallbackMap, OnMissingTranslation } from "./types.js";

export type FormatCoreContext = {
  key: string;
  namespace?: string | undefined;
  locale: string;
  localeFallback?: LocaleFallbackMap | undefined;
  onMissing: OnMissingTranslation;
};

export type ResolveAndFormatOptions = {
  localeByKey: Record<string, string | undefined> | undefined;
  locale: string;
  params?: Record<string, unknown> | undefined;
  getCache: (resolvedLocale: string) => LocaleCache;
  context: FormatCoreContext;
};

function formatErrorLabel(context: Pick<FormatCoreContext, "key" | "namespace">): string {
  if (context.namespace !== undefined) {
    return `namespace "${context.namespace}", key "${context.key}"`;
  }
  return `key "${context.key}"`;
}

function formatMissingError(context: FormatCoreContext): string {
  const chain = formatLocaleFallbackChain(context.locale, context.localeFallback);
  if (context.namespace !== undefined) {
    return `[i18n] Missing key or locale: namespace "${context.namespace}", key "${context.key}" [${context.locale}] (fallback chain: ${chain})`;
  }
  return `[i18n] Missing key or locale: "${context.key}" [${context.locale}] (fallback chain: ${chain})`;
}

function resolveMissing(context: FormatCoreContext): string {
  const chain = formatLocaleFallbackChain(context.locale, context.localeFallback);
  if (context.onMissing === "key") {
    if (context.namespace !== undefined) {
      return `${context.namespace}.${context.key}`;
    }
    return context.key;
  }
  if (typeof context.onMissing === "function") {
    return context.onMissing({
      ...(context.namespace !== undefined ? { namespace: context.namespace } : {}),
      key: context.key,
      locale: context.locale,
      fallbackChain: chain,
    });
  }
  throw new Error(formatMissingError(context));
}

/**
 * Shared runtime path for both ICU providers: resolve locale (with fallback) →
 * compile template (cached) → format with params; handles missing keys via `onMissing`.
 */
export function resolveAndFormat(options: ResolveAndFormatOptions): string {
  const { localeByKey, locale, params, getCache, context } = options;
  const resolved = resolveLocaleTemplate(localeByKey, locale, context.localeFallback);

  if (!resolved) {
    return resolveMissing(context);
  }

  const { template, resolvedLocale } = resolved;
  const cache = getCache(resolvedLocale);
  const cacheKey = context.key;
  const label = formatErrorLabel(context);

  if (!cache[cacheKey]) {
    try {
      cache[cacheKey] = new IntlMessageFormat(template, resolvedLocale);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[i18n ICU Syntax Error] Dictionary error for ${label} [${resolvedLocale}]: ${message}`
      );
    }
  }

  try {
    return cache[cacheKey].format(params) as string;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[i18n Formatting Error] Invalid or missing parameters for ${label} [${resolvedLocale}]: ${message}`
    );
  }
}
