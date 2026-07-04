import { IntlMessageFormat } from "intl-messageformat";
import { cloneAndFreeze } from "./deep-freeze.js";
import {
  formatLocaleFallbackChain,
  resolveLocaleTemplate,
  validateLocaleFallback,
} from "./resolve-locale.js";
import type {
  IcuTranslationProviderOptions,
  KeyDictionary,
  LocaleFallbackMap,
  LocaleOfSingle,
  SingleCompiledCache,
} from "./types.js";

export interface TranslationProviderSingleForLocale<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  Locale extends string,
> {
  readonly locale: Locale;
  get<K extends keyof Schema & string>(
    key: K,
    ...params: Params[K] extends never ? [] : [params: Params[K]]
  ): string;
}

export interface TranslationProviderSingle<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
> {
  get<K extends keyof Schema & string>(
    key: K,
    locale: RequestLocales,
    ...params: Params[K] extends never ? [] : [params: Params[K]]
  ): string;
  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): TranslationProviderSingleForLocale<Schema, Params, Locale>;
  getAll(): Schema;
  setAll(values: Schema): void;
}

export class IcuTranslationProviderSingleForLocale<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string,
  Locale extends RequestLocales,
  Fallback extends LocaleFallbackMap | undefined,
> implements TranslationProviderSingleForLocale<Schema, Params, Locale> {
  constructor(
    private readonly provider: IcuTranslationProviderSingle<
      Schema,
      Params,
      RequestLocales,
      Fallback
    >,
    readonly locale: Locale
  ) {}

  get<K extends keyof Schema & string>(
    key: K,
    ...args: Params[K] extends never ? [] : [params: Params[K]]
  ): string {
    return (
      this.provider.get as (
        key: K,
        locale: Locale,
        ...params: Params[K] extends never ? [] : [params: Params[K]]
      ) => string
    )(key, this.locale, ...args);
  }
}

export class IcuTranslationProviderSingle<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
  Fallback extends LocaleFallbackMap | undefined = undefined,
> implements TranslationProviderSingle<Schema, Params, RequestLocales> {
  private dictionary: Schema;
  private compiledCache: SingleCompiledCache = {};
  private readonly localeFallback?: Fallback;

  constructor(dictionary: Schema, options?: IcuTranslationProviderOptions<Fallback>) {
    this.dictionary = structuredClone(dictionary);
    if (options?.localeFallback) {
      validateLocaleFallback(options.localeFallback);
      this.localeFallback = options.localeFallback;
    }
  }

  get<K extends keyof Schema & string>(
    key: K,
    locale: RequestLocales,
    ...args: Params[K] extends never ? [] : [params: Params[K]]
  ): string {
    const params = args[0] as Record<string, unknown> | undefined;
    const resolved = resolveLocaleTemplate(this.dictionary[key], locale, this.localeFallback);

    if (!resolved) {
      const chain = formatLocaleFallbackChain(locale, this.localeFallback);
      throw new Error(
        `[i18n] Missing key or locale: "${String(key)}" [${locale}] (fallback chain: ${chain})`
      );
    }

    const { template, resolvedLocale } = resolved;

    if (!this.compiledCache[resolvedLocale]) {
      this.compiledCache[resolvedLocale] = {};
    }

    const cacheKey = String(key);

    if (!this.compiledCache[resolvedLocale][cacheKey]) {
      try {
        this.compiledCache[resolvedLocale][cacheKey] = new IntlMessageFormat(
          template,
          resolvedLocale
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `[i18n ICU Syntax Error] Dictionary error for key "${String(key)}" [${resolvedLocale}]: ${message}`
        );
      }
    }

    try {
      return this.compiledCache[resolvedLocale][cacheKey].format(params) as string;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[i18n Formatting Error] Invalid or missing parameters for key "${String(key)}" [${resolvedLocale}]: ${message}`
      );
    }
  }

  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): IcuTranslationProviderSingleForLocale<Schema, Params, RequestLocales, Locale, Fallback> {
    return new IcuTranslationProviderSingleForLocale(this, locale);
  }

  getAll(): Schema {
    return cloneAndFreeze(this.dictionary);
  }

  setAll(values: Schema): void {
    this.dictionary = structuredClone(values);
    this.compiledCache = {};
  }
}
