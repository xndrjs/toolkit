import { cloneAndFreeze } from "./deep-freeze.js";
import { resolveAndFormat } from "./format-core.js";
import { mergeNamespaceLocalesCore } from "./project-locales.js";
import { validateLocaleFallback } from "./resolve-locale.js";
import type {
  IcuTranslationProviderOptions,
  LocaleFallbackMap,
  LocaleOfMulti,
  MultiCompiledCache,
  MultiDictionary,
  OnMissingTranslation,
  PartialKeyDictionary,
  PartialMultiDictionary,
} from "./types.js";

export interface TranslationProviderMultiForLocale<
  Schema extends MultiDictionary,
  Params extends { [NS in keyof Schema]: { [K in keyof Schema[NS]]: unknown } },
  Locale extends string,
> {
  readonly locale: Locale;
  get<NS extends keyof Schema, K extends keyof Schema[NS] & keyof Params[NS] & string>(
    namespace: NS,
    key: K,
    ...params: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
  ): string;
}

export interface TranslationProviderMulti<
  Schema extends MultiDictionary,
  Params extends { [NS in keyof Schema]: { [K in keyof Schema[NS]]: unknown } },
  RequestLocales extends string = LocaleOfMulti<Schema>,
> {
  get<NS extends keyof Schema, K extends keyof Schema[NS] & keyof Params[NS] & string>(
    namespace: NS,
    key: K,
    locale: RequestLocales,
    ...params: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
  ): string;
  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): TranslationProviderMultiForLocale<Schema, Params, Locale>;
  getAll(): Schema;
  setAll(values: Schema): void;
  mergeAll(values: PartialMultiDictionary<Schema, RequestLocales>): void;
  setNamespace<NS extends keyof Schema>(namespace: NS, values: Schema[NS]): void;
  mergeNamespace<NS extends keyof Schema>(
    namespace: NS,
    values: PartialKeyDictionary<Schema[NS], RequestLocales>
  ): void;
}

export class IcuTranslationProviderMultiForLocale<
  Schema extends MultiDictionary,
  Params extends { [NS in keyof Schema]: { [K in keyof Schema[NS]]: unknown } },
  RequestLocales extends string,
  Locale extends RequestLocales,
  Fallback extends LocaleFallbackMap | undefined,
> implements TranslationProviderMultiForLocale<Schema, Params, Locale> {
  constructor(
    private readonly provider: IcuTranslationProviderMulti<
      Schema,
      Params,
      RequestLocales,
      Fallback
    >,
    readonly locale: Locale
  ) {}

  get<NS extends keyof Schema, K extends keyof Schema[NS] & keyof Params[NS] & string>(
    namespace: NS,
    key: K,
    ...args: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
  ): string {
    const params = args[0] as Record<string, unknown> | undefined;
    return this.provider.getWithLocale(String(namespace), String(key), this.locale, params);
  }
}

export class IcuTranslationProviderMulti<
  Schema extends MultiDictionary,
  Params extends { [NS in keyof Schema]: { [K in keyof Schema[NS]]: unknown } },
  RequestLocales extends string = LocaleOfMulti<Schema>,
  Fallback extends LocaleFallbackMap | undefined = undefined,
> implements TranslationProviderMulti<Schema, Params, RequestLocales> {
  private dictionary: Schema;
  private compiledCache: MultiCompiledCache = {};
  private readonly localeFallback?: Fallback;
  private readonly onMissing: OnMissingTranslation;

  constructor(
    dictionary: PartialMultiDictionary<Schema, RequestLocales>,
    options?: IcuTranslationProviderOptions<Fallback>
  ) {
    this.dictionary = structuredClone(dictionary) as Schema;
    if (options?.localeFallback) {
      validateLocaleFallback(options.localeFallback);
      this.localeFallback = options.localeFallback;
    }
    this.onMissing = options?.onMissing ?? "throw";
  }

  get<NS extends keyof Schema, K extends keyof Schema[NS] & keyof Params[NS] & string>(
    namespace: NS,
    key: K,
    locale: RequestLocales,
    ...args: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
  ): string {
    const params = args[0] as Record<string, unknown> | undefined;
    return this.getWithLocale(String(namespace), String(key), locale, params);
  }

  getWithLocale(
    namespace: string,
    key: string,
    locale: string,
    params?: Record<string, unknown>
  ): string {
    const localeByKey = (
      this.dictionary[namespace] as Record<string, Record<string, string>> | undefined
    )?.[key];

    return resolveAndFormat({
      localeByKey,
      locale,
      params,
      getCache: (resolvedLocale) => {
        if (!this.compiledCache[resolvedLocale]) {
          this.compiledCache[resolvedLocale] = {};
        }
        if (!this.compiledCache[resolvedLocale]![namespace]) {
          this.compiledCache[resolvedLocale]![namespace] = {};
        }
        return this.compiledCache[resolvedLocale]![namespace]!;
      },
      context: {
        namespace,
        key,
        locale,
        localeFallback: this.localeFallback,
        onMissing: this.onMissing,
      },
    });
  }

  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): IcuTranslationProviderMultiForLocale<Schema, Params, RequestLocales, Locale, Fallback> {
    return new IcuTranslationProviderMultiForLocale(this, locale);
  }

  getAll(): Schema {
    return cloneAndFreeze(this.dictionary);
  }

  setAll(values: Schema): void {
    this.dictionary = structuredClone(values);
    this.compiledCache = {};
  }

  mergeAll(values: PartialMultiDictionary<Schema, RequestLocales>): void {
    for (const namespace of Object.keys(values) as (keyof Schema & string)[]) {
      const incoming = values[namespace];
      if (incoming !== undefined) {
        this.mergeNamespace(namespace, incoming);
      }
    }
  }

  setNamespace<NS extends keyof Schema>(namespace: NS, values: Schema[NS]): void {
    this.dictionary = {
      ...this.dictionary,
      [namespace]: structuredClone(values),
    };

    for (const locale of Object.keys(this.compiledCache)) {
      delete this.compiledCache[locale]?.[namespace as string];
    }
  }

  mergeNamespace<NS extends keyof Schema>(
    namespace: NS,
    values: PartialKeyDictionary<Schema[NS], RequestLocales>
  ): void {
    const existing = this.dictionary[namespace];
    const merged = mergeNamespaceLocalesCore((existing ?? {}) as Schema[NS], values);

    this.dictionary = {
      ...this.dictionary,
      [namespace]: merged,
    };

    for (const locale of Object.keys(this.compiledCache)) {
      delete this.compiledCache[locale]?.[namespace as string];
    }
  }
}
