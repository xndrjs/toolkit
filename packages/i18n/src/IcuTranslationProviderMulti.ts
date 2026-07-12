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
  mergeNamespace<NS extends keyof Schema>(namespace: NS, values: Schema[NS]): void;
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
  private loadedNamespaces: Set<string>;

  constructor(dictionary: Partial<Schema>, options?: IcuTranslationProviderOptions<Fallback>) {
    this.dictionary = structuredClone(dictionary) as Schema;
    this.loadedNamespaces = new Set(Object.keys(dictionary));
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
    if (!this.loadedNamespaces.has(namespace)) {
      throw new Error(
        `[i18n] Namespace not loaded: "${namespace}". Register it with setNamespace() before calling .get().`
      );
    }

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

  mergeNamespace<NS extends keyof Schema>(namespace: NS, values: Schema[NS]): void {
    if (!this.loadedNamespaces.has(namespace as string)) {
      this.setNamespace(namespace, values);
      return;
    }

    const existing = this.dictionary[namespace];
    this.setNamespace(namespace, mergeNamespaceLocalesCore(existing as Schema[NS], values));
  }
}
