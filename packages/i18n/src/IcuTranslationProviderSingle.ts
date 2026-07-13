import { cloneAndFreeze } from "./deep-freeze.js";
import type { I18nEngineSingle } from "./engine.js";
import { resolveAndFormat } from "./format-core.js";
import { mergeNamespaceLocalesCore } from "./project-locales.js";
import { validateLocaleFallback } from "./resolve-locale.js";
import type {
  IcuTranslationProviderOptions,
  KeyDictionary,
  LocaleFallbackMap,
  LocaleOfSingle,
  OnMissingTranslation,
  SingleCompiledCache,
  PartialKeyDictionary,
} from "./types.js";
import { I18nViewSingleForLocaleImpl, I18nViewSingleImpl } from "./view-single.js";

/** @deprecated Use `I18nEngineSingle` instead. */
export type TranslationProviderSingle<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
> = I18nEngineSingle<Schema, Params, RequestLocales>;

/** @deprecated Use `I18nViewSingleForLocale` instead. */
export type TranslationProviderSingleForLocale<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  Locale extends string,
> = import("./view-single.js").I18nViewSingleForLocale<Schema, Params, Locale>;

export class IcuTranslationProviderSingle<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
  Fallback extends LocaleFallbackMap | undefined = undefined,
> implements I18nEngineSingle<Schema, Params, RequestLocales> {
  private dictionary: Schema;
  private compiledCache: SingleCompiledCache = {};
  private readonly localeFallback?: Fallback;
  private readonly onMissing: OnMissingTranslation;

  constructor(dictionary: Schema, options?: IcuTranslationProviderOptions<Fallback>) {
    this.dictionary = structuredClone(dictionary);
    if (options?.localeFallback) {
      validateLocaleFallback(options.localeFallback);
      this.localeFallback = options.localeFallback;
    }
    this.onMissing = options?.onMissing ?? "throw";
  }

  getWithLocale(key: string, locale: string, params?: Record<string, unknown>): string {
    return resolveAndFormat({
      localeByKey: this.dictionary[key],
      locale,
      params,
      getCache: (resolvedLocale) => {
        if (!this.compiledCache[resolvedLocale]) {
          this.compiledCache[resolvedLocale] = {};
        }
        return this.compiledCache[resolvedLocale]!;
      },
      context: {
        key,
        locale,
        localeFallback: this.localeFallback,
        onMissing: this.onMissing,
      },
    });
  }

  toView(): I18nViewSingleImpl<Schema, Params, RequestLocales, Fallback>;
  toView<Locale extends RequestLocales>(options: {
    locale: Locale;
  }): I18nViewSingleForLocaleImpl<Schema, Params, RequestLocales, Locale, Fallback>;
  toView<Locale extends RequestLocales>(options?: { locale?: Locale }) {
    if (options?.locale !== undefined) {
      return new I18nViewSingleForLocaleImpl(this, options.locale);
    }
    return new I18nViewSingleImpl(this);
  }

  getAll(): Schema {
    return cloneAndFreeze(this.dictionary);
  }

  setAll(values: Schema): void {
    this.dictionary = structuredClone(values);
    this.compiledCache = {};
  }

  mergeAll(values: PartialKeyDictionary<Schema, RequestLocales>): void {
    this.dictionary = mergeNamespaceLocalesCore(this.dictionary, values);

    for (const [key, incomingLocales] of Object.entries(values)) {
      if (incomingLocales === undefined || typeof incomingLocales !== "object") {
        continue;
      }

      for (const locale of Object.keys(incomingLocales)) {
        delete this.compiledCache[locale]?.[key];
      }
    }
  }
}
