import { BuilderLoadRegistry, type BuilderResourceEntry } from "./builder-load-registry.js";
import type { I18nEngineMulti } from "./engine.js";
import type { I18nSerializedState } from "./serialized-state.js";
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
  readonly __i18nEngineMode = "multi" as const;

  /** Loaded namespaces only — cold start is `{}`; never claim full Schema until loaded. */
  private dictionary: PartialMultiDictionary<Schema, RequestLocales>;
  private compiledCache: MultiCompiledCache = {};
  private readonly builderLoadRegistry = new BuilderLoadRegistry();
  private readonly localeFallback?: Fallback;
  private readonly onMissing: OnMissingTranslation;

  constructor(
    dictionary: PartialMultiDictionary<Schema, RequestLocales> = {},
    options?: IcuTranslationProviderOptions<Fallback>
  ) {
    this.dictionary = structuredClone(dictionary);
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
      this.dictionary[namespace as keyof Schema] as
        | Record<string, Record<string, string>>
        | undefined
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

  /** Live dictionary reference (loaded namespaces only). Do not mutate. */
  getAll(): PartialMultiDictionary<Schema, RequestLocales> {
    return this.dictionary;
  }

  hasBuilderResourceLoaded(namespace: string, partition: string): boolean {
    return this.builderLoadRegistry.has(namespace, partition);
  }

  markBuilderResourcePending(namespace: string, partition: string): void {
    this.builderLoadRegistry.markPending(namespace, partition);
  }

  markBuilderResourceLoaded(namespace: string, partition: string): void {
    this.builderLoadRegistry.mark(namespace, partition);
  }

  markBuilderResourceError(namespace: string, partition: string, error: unknown): void {
    this.builderLoadRegistry.markError(namespace, partition, error);
  }

  getBuilderLoadState() {
    return this.builderLoadRegistry.getLoadState();
  }

  seedBuilderResources(resources: readonly BuilderResourceEntry[]): void {
    this.builderLoadRegistry.seed(resources);
  }

  serialize(): I18nSerializedState<PartialMultiDictionary<Schema, RequestLocales>> {
    return {
      dictionary: this.dictionary,
      resources: this.builderLoadRegistry.entries(),
    };
  }

  applyLoadMergeNamespace<NS extends keyof Schema>(
    namespace: NS,
    values: PartialKeyDictionary<Schema[NS], RequestLocales>
  ): void {
    const existing = (this.dictionary[namespace] ?? {}) as Schema[NS];
    const merged = mergeNamespaceLocalesCore(existing, values);

    this.dictionary = {
      ...this.dictionary,
      [namespace]: merged,
    };

    for (const [key, incomingLocales] of Object.entries(values)) {
      if (incomingLocales === undefined || typeof incomingLocales !== "object") {
        continue;
      }

      for (const locale of Object.keys(incomingLocales)) {
        delete this.compiledCache[locale]?.[namespace as string]?.[key];
      }
    }
  }

  applyLoadMergeAll(values: PartialMultiDictionary<Schema, RequestLocales>): void {
    for (const namespace of Object.keys(values) as (keyof Schema & string)[]) {
      const incoming = values[namespace];
      if (incoming !== undefined) {
        this.applyLoadMergeNamespace(namespace, incoming);
      }
    }
  }
}
