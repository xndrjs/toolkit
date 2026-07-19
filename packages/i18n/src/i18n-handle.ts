import { invokeNamespaceLoader, type NamespaceLoader } from "./builder-loaders.js";
import type { I18nEngineMultiImpl } from "./engine.js";
import type {
  LocaleFallbackMap,
  LocaleOfMulti,
  MultiDictionary,
  PartialKeyDictionary,
  PartialMultiDictionary,
} from "./types.js";
import type { I18nScopeMultiForLocale } from "./scope-multi.js";
import type { MultiParams, ParamsForNamespaces, SchemaForNamespaces } from "./scope-types.js";

/** Engine handle accepted by {@link createI18nHandle} (with or without localeFallback). */
type HandleEngine<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
> = I18nEngineMultiImpl<Schema, Params, RequestLocales, LocaleFallbackMap | undefined>;

/** Non-empty namespace list — required by {@link I18nHandle.load} / {@link I18nHandle.peek}. */
type NonEmptyNamespaces<NS extends readonly string[]> = NS extends readonly [] ? never : NS;

/** Maps a request locale to the delivery partition key (locale itself, or a custom area). */
export type PartitionForLocale<RequestLocales extends string> = (locale: RequestLocales) => string;

export type I18nHandleOptions<
  Schema extends MultiDictionary,
  RequestLocales extends string = LocaleOfMulti<Schema>,
> = {
  namespaceLoaders?: {
    [NS in keyof Schema & string]?: NamespaceLoader<
      PartialKeyDictionary<Schema[NS], RequestLocales> | Schema[NS]
    >;
  };
  /**
   * Resolves the loader partition for a locale.
   * Default: identity (`locale → locale`) for split-by-locale.
   * Custom delivery: codegen injects `locale → LOCALE_DELIVERY_AREA[locale]`.
   */
  partitionForLocale?: PartitionForLocale<RequestLocales>;
};

export type LoadNamespacesInput<
  Schema extends MultiDictionary,
  NsList extends readonly (keyof Schema & string)[],
  Locale extends string,
> = {
  namespaces: NonEmptyNamespaces<NsList>;
  locale: Locale;
};

/** Locale-bound scope returned by {@link I18nHandle.load} / {@link I18nHandle.peek}. */
export type ScopeForLocale<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  NsList extends readonly (keyof Schema & string)[],
  Locale extends RequestLocales,
> = I18nScopeMultiForLocale<
  SchemaForNamespaces<Schema, NsList>,
  ParamsForNamespaces<Schema, Params, NsList>,
  RequestLocales,
  Locale
>;

/**
 * Single runtime handle: pass `namespaces` + `locale`; partition is derived via
 * {@link I18nHandleOptions.partitionForLocale}.
 */
export interface I18nHandle<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
> {
  load<const NsList extends readonly (keyof Schema & string)[], Locale extends RequestLocales>(
    input: LoadNamespacesInput<Schema, NsList, Locale>
  ): Promise<ScopeForLocale<Schema, Params, RequestLocales, NsList, Locale>>;

  /**
   * Sync scope when every requested resource is already marked loaded (e.g. hydrate seed).
   * Returns `null` when a normal async {@link load} is still required.
   */
  peek<const NsList extends readonly (keyof Schema & string)[], Locale extends RequestLocales>(
    input: LoadNamespacesInput<Schema, NsList, Locale>
  ): ScopeForLocale<Schema, Params, RequestLocales, NsList, Locale> | null;

  /** Dictionary (loaded namespaces) + resources for SSR→CSR hydrate. */
  serialize(): {
    dictionary: PartialMultiDictionary<Schema, RequestLocales>;
    resources: readonly (readonly [string, string])[];
  };
}

export class I18nHandleImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
> implements I18nHandle<Schema, Params, RequestLocales> {
  private readonly partitionForLocale: PartitionForLocale<RequestLocales>;

  constructor(
    private readonly engine: HandleEngine<Schema, Params, RequestLocales>,
    private readonly options?: I18nHandleOptions<Schema, RequestLocales>
  ) {
    this.partitionForLocale = options?.partitionForLocale ?? ((locale) => locale);
  }

  async load<
    const NsList extends readonly (keyof Schema & string)[],
    Locale extends RequestLocales,
  >(
    input: LoadNamespacesInput<Schema, NsList, Locale>
  ): Promise<ScopeForLocale<Schema, Params, RequestLocales, NsList, Locale>> {
    await applyHandleLoad(this.engine, this.options, input, this.partitionForLocale);
    return this.engine.toScope({ namespaces: input.namespaces }).forLocale(input.locale);
  }

  peek<const NsList extends readonly (keyof Schema & string)[], Locale extends RequestLocales>(
    input: LoadNamespacesInput<Schema, NsList, Locale>
  ): ScopeForLocale<Schema, Params, RequestLocales, NsList, Locale> | null {
    if (!areHandleResourcesReady(this.engine, this.options, input, this.partitionForLocale)) {
      return null;
    }
    return this.engine.toScope({ namespaces: input.namespaces }).forLocale(input.locale);
  }

  serialize() {
    return this.engine.serialize();
  }
}

export function createI18nHandle<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
>(
  engine: HandleEngine<Schema, Params, RequestLocales>,
  options?: I18nHandleOptions<Schema, RequestLocales>
): I18nHandle<Schema, Params, RequestLocales> {
  return new I18nHandleImpl(engine, options);
}

function areHandleResourcesReady<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  NsList extends readonly (keyof Schema & string)[],
  Locale extends RequestLocales,
>(
  engine: HandleEngine<Schema, Params, RequestLocales>,
  options: I18nHandleOptions<Schema, RequestLocales> | undefined,
  input: LoadNamespacesInput<Schema, NsList, Locale>,
  partitionForLocale: PartitionForLocale<RequestLocales>
): boolean {
  if (input.namespaces.length === 0) {
    return false;
  }
  const partition = partitionForLocale(input.locale);
  return input.namespaces.every((namespace) => {
    const loader = options?.namespaceLoaders?.[namespace];
    if (loader === undefined) {
      return true;
    }
    return engine.hasBuilderResourceLoaded(namespace, partition);
  });
}

async function applyHandleLoad<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  NsList extends readonly (keyof Schema & string)[],
  Locale extends RequestLocales,
>(
  engine: HandleEngine<Schema, Params, RequestLocales>,
  options: I18nHandleOptions<Schema, RequestLocales> | undefined,
  input: LoadNamespacesInput<Schema, NsList, Locale>,
  partitionForLocale: PartitionForLocale<RequestLocales>
): Promise<void> {
  if (input.namespaces.length === 0) {
    throw new Error("[i18n] load() requires a non-empty namespaces array.");
  }

  const partition = partitionForLocale(input.locale);

  await Promise.all(
    input.namespaces.map(async (namespace) => {
      const loader = options?.namespaceLoaders?.[namespace];
      if (loader === undefined) {
        return;
      }

      if (engine.hasBuilderResourceLoaded(namespace, partition)) {
        return;
      }

      const data = await invokeNamespaceLoader(loader, partition, { locale: input.locale });
      engine.applyLoadMergeNamespace(namespace, data);
      engine.markBuilderResourceLoaded(namespace, partition);
    })
  );
}
