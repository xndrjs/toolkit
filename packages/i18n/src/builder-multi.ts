import { invokeNamespaceLoader, type NamespaceLoader } from "./builder-loaders.js";
import type { DeliveryArtifactsMap, LocalesForDeliveryAreaOrAll } from "./builder-types.js";
import type { I18nEngineMultiImpl } from "./engine.js";
import type { LocaleOfMulti, MultiDictionary, PartialKeyDictionary } from "./types.js";
import type { I18nScopeMulti, I18nScopeMultiForLocale } from "./scope-multi.js";
import type { MultiParams, ParamsForNamespaces, SchemaForNamespaces } from "./scope-types.js";

export type I18nBuilderMultiOptions<
  Schema extends MultiDictionary,
  RequestLocales extends string = LocaleOfMulti<Schema>,
> = {
  namespaceLoaders?: {
    [NS in keyof Schema & string]?: NamespaceLoader<
      PartialKeyDictionary<Schema[NS], RequestLocales> | Schema[NS]
    >;
  };
};

export interface I18nBuilderMulti<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
  ActiveLocales extends RequestLocales = RequestLocales,
  NsList extends readonly (keyof Schema & string)[] = readonly [],
  DeliveryArea extends string = never,
  DeliveryArtifacts extends DeliveryArtifactsMap<RequestLocales, DeliveryArea> =
    DeliveryArtifactsMap<RequestLocales, DeliveryArea>,
> {
  withNamespaces<const NS extends readonly (keyof Schema & string)[]>(
    namespaces: NS
  ): I18nBuilderMulti<
    Schema,
    Params,
    RequestLocales,
    ActiveLocales,
    NS,
    DeliveryArea,
    DeliveryArtifacts
  >;

  withLocale<Locale extends ActiveLocales>(
    locale: Locale
  ): I18nBuilderMultiForLocale<
    Schema,
    Params,
    RequestLocales,
    ActiveLocales,
    NsList,
    Locale,
    DeliveryArea,
    DeliveryArtifacts
  >;

  withDeliveryArea<Area extends DeliveryArea>(
    area: Area
  ): I18nBuilderMultiPartitioned<
    Schema,
    Params,
    RequestLocales,
    LocalesForDeliveryAreaOrAll<RequestLocales, DeliveryArea, DeliveryArtifacts, Area>,
    NsList,
    DeliveryArea,
    DeliveryArtifacts
  >;

  load(): Promise<
    I18nScopeMulti<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      ActiveLocales
    >
  >;
}

/** Builder after `withDeliveryArea` — partition is fixed; bind locale via `scope.forLocale` after `load()`. */
export interface I18nBuilderMultiPartitioned<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  ActiveLocales extends RequestLocales,
  NsList extends readonly (keyof Schema & string)[],
  DeliveryArea extends string = never,
  DeliveryArtifacts extends DeliveryArtifactsMap<RequestLocales, DeliveryArea> =
    DeliveryArtifactsMap<RequestLocales, DeliveryArea>,
> {
  withNamespaces<const NS extends readonly (keyof Schema & string)[]>(
    namespaces: NS
  ): I18nBuilderMultiPartitioned<
    Schema,
    Params,
    RequestLocales,
    ActiveLocales,
    NS,
    DeliveryArea,
    DeliveryArtifacts
  >;

  load(): Promise<
    I18nScopeMulti<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      ActiveLocales
    >
  >;
}

export interface I18nBuilderMultiForLocale<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  ActiveLocales extends RequestLocales,
  NsList extends readonly (keyof Schema & string)[],
  Locale extends ActiveLocales,
  DeliveryArea extends string = never,
  DeliveryArtifacts extends DeliveryArtifactsMap<RequestLocales, DeliveryArea> =
    DeliveryArtifactsMap<RequestLocales, DeliveryArea>,
> {
  load(): Promise<
    I18nScopeMultiForLocale<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      Locale,
      Locale
    >
  >;
}

type MultiBuilderState<
  Schema extends MultiDictionary,
  RequestLocales extends string = LocaleOfMulti<Schema>,
  NsList extends readonly (keyof Schema & string)[] = readonly (keyof Schema & string)[],
> = {
  namespaces: NsList;
  locale?: RequestLocales;
  deliveryArea?: string;
};

export class I18nBuilderMultiImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
  ActiveLocales extends RequestLocales = RequestLocales,
  NsList extends readonly (keyof Schema & string)[] = readonly (keyof Schema & string)[],
  DeliveryArea extends string = never,
  DeliveryArtifacts extends DeliveryArtifactsMap<RequestLocales, DeliveryArea> =
    DeliveryArtifactsMap<RequestLocales, DeliveryArea>,
> implements I18nBuilderMulti<
  Schema,
  Params,
  RequestLocales,
  ActiveLocales,
  NsList,
  DeliveryArea,
  DeliveryArtifacts
> {
  private state: MultiBuilderState<Schema, RequestLocales, NsList>;

  constructor(
    private readonly engine: I18nEngineMultiImpl<Schema, Params, RequestLocales>,
    private readonly options?: I18nBuilderMultiOptions<Schema, RequestLocales>,
    state?: MultiBuilderState<Schema, RequestLocales, NsList>
  ) {
    if (state !== undefined) {
      this.state = {
        namespaces: state.namespaces,
        ...(state.locale !== undefined ? { locale: state.locale } : {}),
        ...(state.deliveryArea !== undefined ? { deliveryArea: state.deliveryArea } : {}),
      };
      return;
    }

    this.state = {
      namespaces: [] as unknown as NsList,
    };
  }

  private clone(): MultiBuilderState<Schema, RequestLocales, NsList> {
    return {
      namespaces: this.state.namespaces,
      ...(this.state.locale !== undefined ? { locale: this.state.locale } : {}),
      ...(this.state.deliveryArea !== undefined ? { deliveryArea: this.state.deliveryArea } : {}),
    };
  }

  withNamespaces<const NS extends readonly (keyof Schema & string)[]>(
    namespaces: NS
  ): I18nBuilderMultiImpl<
    Schema,
    Params,
    RequestLocales,
    ActiveLocales,
    NS,
    DeliveryArea,
    DeliveryArtifacts
  > {
    return new I18nBuilderMultiImpl<
      Schema,
      Params,
      RequestLocales,
      ActiveLocales,
      NS,
      DeliveryArea,
      DeliveryArtifacts
    >(this.engine, this.options, {
      ...this.clone(),
      namespaces,
    });
  }

  withLocale<Locale extends ActiveLocales>(
    locale: Locale
  ): I18nBuilderMultiForLocaleImpl<
    Schema,
    Params,
    RequestLocales,
    ActiveLocales,
    NsList,
    Locale,
    DeliveryArea,
    DeliveryArtifacts
  > {
    const { deliveryArea: _deliveryArea, ...rest } = this.clone();
    return new I18nBuilderMultiForLocaleImpl<
      Schema,
      Params,
      RequestLocales,
      ActiveLocales,
      NsList,
      Locale,
      DeliveryArea,
      DeliveryArtifacts
    >(this.engine, this.options, { ...rest, locale });
  }

  withDeliveryArea<Area extends DeliveryArea>(
    area: Area
  ): I18nBuilderMultiPartitionedImpl<
    Schema,
    Params,
    RequestLocales,
    LocalesForDeliveryAreaOrAll<RequestLocales, DeliveryArea, DeliveryArtifacts, Area>,
    NsList,
    DeliveryArea,
    DeliveryArtifacts
  > {
    const { locale: _locale, ...rest } = this.clone();
    return new I18nBuilderMultiPartitionedImpl<
      Schema,
      Params,
      RequestLocales,
      LocalesForDeliveryAreaOrAll<RequestLocales, DeliveryArea, DeliveryArtifacts, Area>,
      NsList,
      DeliveryArea,
      DeliveryArtifacts
    >(this.engine, this.options, { ...rest, deliveryArea: area });
  }

  async load(): Promise<
    I18nScopeMulti<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      ActiveLocales
    >
  > {
    await applyMultiBuilderLoad(this.engine, this.options, this.state);
    return this.engine.toScope({ namespaces: this.state.namespaces });
  }
}

export class I18nBuilderMultiPartitionedImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  ActiveLocales extends RequestLocales,
  NsList extends readonly (keyof Schema & string)[],
  DeliveryArea extends string = never,
  DeliveryArtifacts extends DeliveryArtifactsMap<RequestLocales, DeliveryArea> =
    DeliveryArtifactsMap<RequestLocales, DeliveryArea>,
> implements I18nBuilderMultiPartitioned<
  Schema,
  Params,
  RequestLocales,
  ActiveLocales,
  NsList,
  DeliveryArea,
  DeliveryArtifacts
> {
  constructor(
    private readonly engine: I18nEngineMultiImpl<Schema, Params, RequestLocales>,
    private readonly options: I18nBuilderMultiOptions<Schema, RequestLocales> | undefined,
    private readonly state: MultiBuilderState<Schema, RequestLocales, NsList> & {
      deliveryArea: string;
    }
  ) {}

  withNamespaces<const NS extends readonly (keyof Schema & string)[]>(
    namespaces: NS
  ): I18nBuilderMultiPartitionedImpl<
    Schema,
    Params,
    RequestLocales,
    ActiveLocales,
    NS,
    DeliveryArea,
    DeliveryArtifacts
  > {
    return new I18nBuilderMultiPartitionedImpl<
      Schema,
      Params,
      RequestLocales,
      ActiveLocales,
      NS,
      DeliveryArea,
      DeliveryArtifacts
    >(this.engine, this.options, {
      ...this.state,
      namespaces,
    });
  }

  async load(): Promise<
    I18nScopeMulti<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      ActiveLocales
    >
  > {
    await applyMultiBuilderLoad(this.engine, this.options, this.state);
    return this.engine.toScope({ namespaces: this.state.namespaces });
  }
}

export class I18nBuilderMultiForLocaleImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  ActiveLocales extends RequestLocales,
  NsList extends readonly (keyof Schema & string)[],
  Locale extends ActiveLocales,
  DeliveryArea extends string = never,
  DeliveryArtifacts extends DeliveryArtifactsMap<RequestLocales, DeliveryArea> =
    DeliveryArtifactsMap<RequestLocales, DeliveryArea>,
> implements I18nBuilderMultiForLocale<
  Schema,
  Params,
  RequestLocales,
  ActiveLocales,
  NsList,
  Locale,
  DeliveryArea,
  DeliveryArtifacts
> {
  constructor(
    private readonly engine: I18nEngineMultiImpl<Schema, Params, RequestLocales>,
    private readonly options: I18nBuilderMultiOptions<Schema, RequestLocales> | undefined,
    private readonly state: MultiBuilderState<Schema, RequestLocales, NsList> & { locale: Locale }
  ) {}

  async load(): Promise<
    I18nScopeMultiForLocale<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      Locale,
      Locale
    >
  > {
    await applyMultiBuilderLoad(this.engine, this.options, this.state);
    return this.engine.toScope({ namespaces: this.state.namespaces }).forLocale(this.state.locale);
  }
}

async function applyMultiBuilderLoad<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  NsList extends readonly (keyof Schema & string)[],
>(
  engine: I18nEngineMultiImpl<Schema, Params, RequestLocales>,
  options: I18nBuilderMultiOptions<Schema, RequestLocales> | undefined,
  state: MultiBuilderState<Schema, RequestLocales, NsList>
): Promise<void> {
  if (state.namespaces.length === 0) {
    throw new Error("[i18n] withNamespaces(...) is required before load().");
  }

  const partition = state.locale ?? state.deliveryArea;

  await Promise.all(
    state.namespaces.map(async (namespace) => {
      const loader = options?.namespaceLoaders?.[namespace];
      if (loader === undefined) {
        return;
      }

      const data = await invokeNamespaceLoader(loader, partition);
      engine.applyLoadMergeNamespace(namespace, data);
    })
  );
}
