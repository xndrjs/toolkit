import type { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import type { IcuTranslationProviderSingle } from "./IcuTranslationProviderSingle.js";
import type {
  KeyDictionary,
  LocaleFallbackMap,
  LocaleOfMulti,
  LocaleOfSingle,
  MultiDictionary,
  PartialKeyDictionary,
  PartialMultiDictionary,
} from "./types.js";
import type { I18nScopeMulti, I18nScopeMultiForLocale } from "./scope-multi.js";
import type { I18nScopeSingle, I18nScopeSingleForLocale } from "./scope-single.js";
import type { MultiParams, ParamsForNamespaces, SchemaForNamespaces } from "./scope-types.js";

/** Mutable translation engine for a single-namespace dictionary. */
export interface I18nEngineSingle<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
> {
  getAll(): Schema;
  setAll(values: Schema): void;
  mergeAll(values: PartialKeyDictionary<Schema, RequestLocales>): void;
  toScope(): I18nScopeSingle<Schema, Params, RequestLocales>;
  toScope<Locale extends RequestLocales>(options: {
    locale: Locale;
  }): I18nScopeSingleForLocale<Schema, Params, Locale>;
}

/** Mutable translation engine for a multi-namespace dictionary. */
export interface I18nEngineMulti<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
> {
  getAll(): Schema;
  setAll(values: Schema): void;
  mergeAll(values: PartialMultiDictionary<Schema, RequestLocales>): void;
  setNamespace<NS extends keyof Schema>(namespace: NS, values: Schema[NS]): void;
  mergeNamespace<NS extends keyof Schema>(
    namespace: NS,
    values: PartialKeyDictionary<Schema[NS], RequestLocales>
  ): void;
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
  >(options: {
    namespaces: NsList;
    locale: Locale;
  }): I18nScopeMultiForLocale<
    SchemaForNamespaces<Schema, NsList>,
    ParamsForNamespaces<Schema, Params, NsList>,
    RequestLocales,
    Locale
  >;
}

/** Alias for the default single-namespace engine implementation. */
export type I18nEngineSingleImpl<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
  Fallback extends LocaleFallbackMap | undefined = undefined,
> = IcuTranslationProviderSingle<Schema, Params, RequestLocales, Fallback>;

/** Alias for the default multi-namespace engine implementation. */
export type I18nEngineMultiImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
  Fallback extends LocaleFallbackMap | undefined = undefined,
> = IcuTranslationProviderMulti<Schema, Params, RequestLocales, Fallback>;
