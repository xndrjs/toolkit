import { IntlMessageFormat } from "intl-messageformat";
import { cloneAndFreeze } from "./deep-freeze.js";
import {
  formatLocaleFallbackChain,
  resolveLocaleTemplate,
  validateLocaleFallback,
} from "./resolve-locale.js";
import type {
  IcuTranslationProviderOptions,
  LocaleFallbackMap,
  LocaleOfMulti,
  MultiCompiledCache,
  MultiDictionary,
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
  hasNamespace<NS extends keyof Schema & string>(namespace: NS): boolean;
  setAll(values: Schema): void;
  setNamespace<NS extends keyof Schema>(namespace: NS, values: Schema[NS]): void;
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
    return (
      this.provider.get as <
        NS extends keyof Schema,
        K extends keyof Schema[NS] & keyof Params[NS] & string,
      >(
        namespace: NS,
        key: K,
        locale: Locale,
        ...params: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
      ) => string
    )(namespace, key, this.locale, ...args);
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
  private loadedNamespaces: Set<string>;

  constructor(dictionary: Partial<Schema>, options?: IcuTranslationProviderOptions<Fallback>) {
    this.dictionary = structuredClone(dictionary) as Schema;
    this.loadedNamespaces = new Set(Object.keys(dictionary));
    if (options?.localeFallback) {
      validateLocaleFallback(options.localeFallback);
      this.localeFallback = options.localeFallback;
    }
  }

  get<NS extends keyof Schema, K extends keyof Schema[NS] & keyof Params[NS] & string>(
    namespace: NS,
    key: K,
    locale: RequestLocales,
    ...args: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
  ): string {
    if (!this.loadedNamespaces.has(namespace as string)) {
      throw new Error(
        `[i18n] Namespace not loaded: "${String(namespace)}". Call ensureNamespacesLoaded(i18n, ["${String(namespace)}"]) first.`
      );
    }

    const params = args[0] as Record<string, unknown> | undefined;
    const localeByKey = (
      this.dictionary[namespace as string] as Record<string, Record<string, string>>
    )?.[key];
    const resolved = resolveLocaleTemplate(localeByKey, locale, this.localeFallback);

    if (!resolved) {
      const chain = formatLocaleFallbackChain(locale, this.localeFallback);
      throw new Error(
        `[i18n] Missing key or locale: namespace "${String(namespace)}", key "${String(key)}" [${locale}] (fallback chain: ${chain})`
      );
    }

    const { template, resolvedLocale } = resolved;

    if (!this.compiledCache[resolvedLocale]) {
      this.compiledCache[resolvedLocale] = {};
    }

    if (!this.compiledCache[resolvedLocale][namespace as string]) {
      this.compiledCache[resolvedLocale][namespace as string] = {};
    }

    const namespaceCache = this.compiledCache[resolvedLocale][namespace as string]!;
    const cacheKey = String(key);

    if (!namespaceCache[cacheKey]) {
      try {
        namespaceCache[cacheKey] = new IntlMessageFormat(template, resolvedLocale);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `[i18n ICU Syntax Error] namespace "${String(namespace)}", key "${String(key)}" [${resolvedLocale}]: ${message}`
        );
      }
    }

    try {
      return namespaceCache[cacheKey].format(params) as string;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `[i18n Formatting Error] namespace "${String(namespace)}", key "${String(key)}" [${resolvedLocale}]: ${message}`
      );
    }
  }

  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): IcuTranslationProviderMultiForLocale<Schema, Params, RequestLocales, Locale, Fallback> {
    return new IcuTranslationProviderMultiForLocale(this, locale);
  }

  getAll(): Schema {
    return cloneAndFreeze(this.dictionary);
  }

  hasNamespace<NS extends keyof Schema & string>(namespace: NS): boolean {
    return this.loadedNamespaces.has(namespace);
  }

  setAll(values: Schema): void {
    this.dictionary = structuredClone(values);
    this.compiledCache = {};
    this.loadedNamespaces = new Set(Object.keys(values));
  }

  setNamespace<NS extends keyof Schema>(namespace: NS, values: Schema[NS]): void {
    this.dictionary = {
      ...this.dictionary,
      [namespace]: structuredClone(values),
    };
    this.loadedNamespaces.add(namespace as string);

    for (const locale of Object.keys(this.compiledCache)) {
      delete this.compiledCache[locale]?.[namespace as string];
    }
  }
}
