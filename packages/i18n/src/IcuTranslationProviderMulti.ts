import { cloneAndFreeze } from "./deep-freeze.js";
import type { I18nEngineMulti } from "./engine.js";
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
import { I18nScopeMultiForLocaleImpl, I18nScopeMultiImpl } from "./scope-multi.js";
import type { I18nScopeMulti, I18nScopeMultiForLocale } from "./scope-multi.js";
import type { MultiParams, ParamsForNamespaces, SchemaForNamespaces } from "./scope-types.js";

export class IcuTranslationProviderMulti<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
  Fallback extends LocaleFallbackMap | undefined = undefined,
> implements I18nEngineMulti<Schema, Params, RequestLocales> {
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

  toScope<
    NsList extends readonly (keyof Schema & string)[],
    Locale extends RequestLocales,
  >(options: {
    namespaces: NsList;
    locale: Locale;
  }): I18nScopeMultiForLocale<
    SchemaForNamespaces<Schema, NsList>,
    ParamsForNamespaces<Schema, Params, NsList>,
    RequestLocales,
    Locale
  >;
  toScope<NsList extends readonly (keyof Schema & string)[]>(options: {
    namespaces: NsList;
  }): I18nScopeMulti<
    SchemaForNamespaces<Schema, NsList>,
    ParamsForNamespaces<Schema, Params, NsList>,
    RequestLocales
  >;
  toScope<
    NsList extends readonly (keyof Schema & string)[],
    Locale extends RequestLocales,
  >(options: { namespaces: NsList; locale?: Locale }) {
    if (options.locale !== undefined) {
      return new I18nScopeMultiForLocaleImpl(this, options.locale) as I18nScopeMultiForLocale<
        SchemaForNamespaces<Schema, NsList>,
        ParamsForNamespaces<Schema, Params, NsList>,
        RequestLocales,
        Locale
      >;
    }
    return new I18nScopeMultiImpl(this) as I18nScopeMulti<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      RequestLocales
    >;
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
