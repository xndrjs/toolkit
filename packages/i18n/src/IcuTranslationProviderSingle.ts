import { cloneAndFreeze } from "./deep-freeze.js";
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
  mergeAll(values: PartialKeyDictionary<Schema, RequestLocales>): void;
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
    const params = args[0] as Record<string, unknown> | undefined;
    return this.provider.getWithLocale(String(key), this.locale, params);
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
  private readonly onMissing: OnMissingTranslation;

  constructor(dictionary: Schema, options?: IcuTranslationProviderOptions<Fallback>) {
    this.dictionary = structuredClone(dictionary);
    if (options?.localeFallback) {
      validateLocaleFallback(options.localeFallback);
      this.localeFallback = options.localeFallback;
    }
    this.onMissing = options?.onMissing ?? "throw";
  }

  get<K extends keyof Schema & string>(
    key: K,
    locale: RequestLocales,
    ...args: Params[K] extends never ? [] : [params: Params[K]]
  ): string {
    const params = args[0] as Record<string, unknown> | undefined;
    return this.getWithLocale(String(key), locale, params);
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
