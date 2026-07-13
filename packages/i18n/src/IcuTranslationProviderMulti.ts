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
import { I18nViewMultiForLocaleImpl, I18nViewMultiImpl } from "./view-multi.js";
import type { I18nViewMulti, I18nViewMultiForLocale } from "./view-multi.js";
import type { MultiParams, ParamsForNamespaces, SchemaForNamespaces } from "./view-types.js";
/** @deprecated Use `I18nEngineMulti` instead. */
export type TranslationProviderMulti<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
> = I18nEngineMulti<Schema, Params, RequestLocales>;

/** @deprecated Use `I18nViewMultiForLocale` instead. */
export type TranslationProviderMultiForLocale<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  Locale extends string,
> = import("./view-multi.js").I18nViewMultiForLocale<Schema, Params, LocaleOfMulti<Schema>, Locale>;

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

  toView<
    NsList extends readonly (keyof Schema & string)[],
    Locale extends RequestLocales,
  >(options: {
    namespaces: NsList;
    locale: Locale;
  }): I18nViewMultiForLocale<
    SchemaForNamespaces<Schema, NsList>,
    ParamsForNamespaces<Schema, Params, NsList>,
    RequestLocales,
    Locale
  >;
  toView<NsList extends readonly (keyof Schema & string)[]>(options: {
    namespaces: NsList;
  }): I18nViewMulti<
    SchemaForNamespaces<Schema, NsList>,
    ParamsForNamespaces<Schema, Params, NsList>,
    RequestLocales
  >;
  toView<
    NsList extends readonly (keyof Schema & string)[],
    Locale extends RequestLocales,
  >(options: { namespaces: NsList; locale?: Locale }) {
    if (options.locale !== undefined) {
      return new I18nViewMultiForLocaleImpl(this, options.locale) as I18nViewMultiForLocale<
        SchemaForNamespaces<Schema, NsList>,
        ParamsForNamespaces<Schema, Params, NsList>,
        RequestLocales,
        Locale
      >;
    }
    return new I18nViewMultiImpl(this) as I18nViewMulti<
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
