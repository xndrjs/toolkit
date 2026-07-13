import { invokeNamespaceLoader, type NamespaceLoader } from "./builder-loaders.js";
import type { I18nEngineMulti } from "./engine.js";
import { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import type {
  KeyDictionary,
  LocaleOfMulti,
  MultiDictionary,
  PartialKeyDictionary,
  PartialMultiDictionary,
} from "./types.js";
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
  NsList extends readonly (keyof Schema & string)[] = readonly [],
> {
  withNamespaces<const NS extends readonly (keyof Schema & string)[]>(
    namespaces: NS
  ): I18nBuilderMulti<Schema, Params, RequestLocales, NS>;

  withLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nBuilderMultiForLocaleImpl<Schema, Params, RequestLocales, NsList, Locale>;

  withDeliveryArea<Area extends string>(
    area: Area
  ): I18nBuilderMulti<Schema, Params, RequestLocales, NsList>;

  withNamespaceData<NS extends keyof Schema & string>(
    namespace: NS,
    data: PartialKeyDictionary<Schema[NS], RequestLocales>
  ): I18nBuilderMulti<Schema, Params, RequestLocales, NsList>;

  load(): Promise<
    I18nScopeMulti<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      RequestLocales
    >
  >;
}

export interface I18nBuilderMultiForLocale<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  NsList extends readonly (keyof Schema & string)[],
  Locale extends RequestLocales,
> {
  withNamespaceData<NS extends keyof Schema & string>(
    namespace: NS,
    data: PartialKeyDictionary<Schema[NS], RequestLocales>
  ): I18nBuilderMultiForLocale<Schema, Params, RequestLocales, NsList, Locale>;

  load(): Promise<
    I18nScopeMultiForLocale<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      RequestLocales,
      Locale
    >
  >;
}

type MultiBuilderState<
  Schema extends MultiDictionary,
  RequestLocales extends string = LocaleOfMulti<Schema>,
> = {
  namespaces: (keyof Schema & string)[];
  locale?: RequestLocales;
  deliveryArea?: string;
  namespaceData: PartialMultiDictionary<Schema, RequestLocales>;
};

export class I18nBuilderMultiImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string = LocaleOfMulti<Schema>,
  NsList extends readonly (keyof Schema & string)[] = readonly [],
> implements I18nBuilderMulti<Schema, Params, RequestLocales, NsList> {
  private state: MultiBuilderState<Schema, RequestLocales> = {
    namespaces: [],
    namespaceData: {},
  };

  constructor(
    private readonly engine: I18nEngineMulti<Schema, Params, RequestLocales>,
    private readonly options?: I18nBuilderMultiOptions<Schema, RequestLocales>,
    state?: MultiBuilderState<Schema, RequestLocales>
  ) {
    if (state !== undefined) {
      this.state = {
        namespaces: [...state.namespaces],
        namespaceData: { ...state.namespaceData },
        ...(state.locale !== undefined ? { locale: state.locale } : {}),
        ...(state.deliveryArea !== undefined ? { deliveryArea: state.deliveryArea } : {}),
      };
    }
  }

  private clone(): MultiBuilderState<Schema, RequestLocales> {
    return {
      namespaces: [...this.state.namespaces],
      namespaceData: { ...this.state.namespaceData },
      ...(this.state.locale !== undefined ? { locale: this.state.locale } : {}),
      ...(this.state.deliveryArea !== undefined ? { deliveryArea: this.state.deliveryArea } : {}),
    };
  }

  withNamespaces<const NS extends readonly (keyof Schema & string)[]>(
    namespaces: NS
  ): I18nBuilderMulti<Schema, Params, RequestLocales, NS> {
    const state = this.clone();
    state.namespaces = [...namespaces];
    return new I18nBuilderMultiImpl<Schema, Params, RequestLocales, NS>(
      this.engine,
      this.options,
      state
    );
  }

  withLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nBuilderMultiForLocaleImpl<Schema, Params, RequestLocales, NsList, Locale> {
    const state = this.clone();
    state.locale = locale;
    delete state.deliveryArea;
    return new I18nBuilderMultiForLocaleImpl<Schema, Params, RequestLocales, NsList, Locale>(
      this.engine,
      this.options,
      state
    );
  }

  withDeliveryArea<Area extends string>(
    area: Area
  ): I18nBuilderMulti<Schema, Params, RequestLocales, NsList> {
    const state = this.clone();
    state.deliveryArea = area;
    delete state.locale;
    return new I18nBuilderMultiImpl<Schema, Params, RequestLocales, NsList>(
      this.engine,
      this.options,
      state
    );
  }

  withNamespaceData<NS extends keyof Schema & string>(
    namespace: NS,
    data: PartialKeyDictionary<Schema[NS], RequestLocales>
  ): I18nBuilderMulti<Schema, Params, RequestLocales, NsList> {
    const state = this.clone();
    const existing = state.namespaceData[namespace];
    state.namespaceData = {
      ...state.namespaceData,
      [namespace]: {
        ...(existing as KeyDictionary | undefined),
        ...data,
      },
    };
    return new I18nBuilderMultiImpl<Schema, Params, RequestLocales, NsList>(
      this.engine,
      this.options,
      state
    );
  }

  async load(): Promise<
    I18nScopeMulti<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      RequestLocales
    >
  > {
    const namespaces = await applyMultiBuilderLoad(this.engine, this.options, this.state);
    const provider = this.engine as unknown as IcuTranslationProviderMulti<
      Schema,
      Params,
      RequestLocales
    >;
    return provider.toScope({ namespaces: namespaces as unknown as NsList });
  }
}

export class I18nBuilderMultiForLocaleImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  NsList extends readonly (keyof Schema & string)[],
  Locale extends RequestLocales,
> implements I18nBuilderMultiForLocale<Schema, Params, RequestLocales, NsList, Locale> {
  constructor(
    private readonly engine: I18nEngineMulti<Schema, Params, RequestLocales>,
    private readonly options: I18nBuilderMultiOptions<Schema, RequestLocales> | undefined,
    private readonly state: MultiBuilderState<Schema, RequestLocales>
  ) {}

  withNamespaceData<NS extends keyof Schema & string>(
    namespace: NS,
    data: PartialKeyDictionary<Schema[NS], RequestLocales>
  ): I18nBuilderMultiForLocale<Schema, Params, RequestLocales, NsList, Locale> {
    const nextState = {
      ...this.state,
      namespaceData: {
        ...this.state.namespaceData,
        [namespace]: {
          ...(this.state.namespaceData[namespace] as KeyDictionary | undefined),
          ...data,
        },
      },
    };
    return new I18nBuilderMultiForLocaleImpl<Schema, Params, RequestLocales, NsList, Locale>(
      this.engine,
      this.options,
      nextState
    );
  }

  async load(): Promise<
    I18nScopeMultiForLocale<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      RequestLocales,
      Locale
    >
  > {
    const namespaces = await applyMultiBuilderLoad(this.engine, this.options, this.state);
    const provider = this.engine as unknown as IcuTranslationProviderMulti<
      Schema,
      Params,
      RequestLocales
    >;
    return provider
      .toScope({ namespaces: namespaces as unknown as NsList })
      .forLocale(this.state.locale as Locale);
  }
}

async function applyMultiBuilderLoad<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
>(
  engine: I18nEngineMulti<Schema, Params, RequestLocales>,
  options: I18nBuilderMultiOptions<Schema, RequestLocales> | undefined,
  state: MultiBuilderState<Schema, RequestLocales>
): Promise<(keyof Schema & string)[]> {
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
      engine.mergeNamespace(
        namespace,
        data as PartialKeyDictionary<Schema[typeof namespace], RequestLocales>
      );
    })
  );

  for (const namespace of Object.keys(state.namespaceData) as (keyof Schema & string)[]) {
    const data = state.namespaceData[namespace];
    if (data !== undefined) {
      engine.mergeNamespace(namespace, data);
    }
  }

  return state.namespaces;
}
