import { invokeNamespaceLoader, type NamespaceLoader } from "./builder-loaders.js";
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
  NsList extends readonly (keyof Schema & string)[] = readonly (keyof Schema & string)[],
> implements I18nBuilderMulti<Schema, Params, RequestLocales, NsList> {
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

    // Empty until withNamespaces(); NsList is narrowed on the next builder clone.
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
  ): I18nBuilderMultiImpl<Schema, Params, RequestLocales, NS> {
    return new I18nBuilderMultiImpl<Schema, Params, RequestLocales, NS>(this.engine, this.options, {
      ...this.clone(),
      namespaces,
    });
  }

  withLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nBuilderMultiForLocaleImpl<Schema, Params, RequestLocales, NsList, Locale> {
    const { deliveryArea: _deliveryArea, ...rest } = this.clone();
    return new I18nBuilderMultiForLocaleImpl<Schema, Params, RequestLocales, NsList, Locale>(
      this.engine,
      this.options,
      { ...rest, locale }
    );
  }

  withDeliveryArea<Area extends string>(
    area: Area
  ): I18nBuilderMultiImpl<Schema, Params, RequestLocales, NsList> {
    const { locale: _locale, ...rest } = this.clone();
    return new I18nBuilderMultiImpl<Schema, Params, RequestLocales, NsList>(
      this.engine,
      this.options,
      { ...rest, deliveryArea: area }
    );
  }

  async load(): Promise<
    I18nScopeMulti<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      RequestLocales
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
  NsList extends readonly (keyof Schema & string)[],
  Locale extends RequestLocales,
> implements I18nBuilderMultiForLocale<Schema, Params, RequestLocales, NsList, Locale> {
  constructor(
    private readonly engine: I18nEngineMultiImpl<Schema, Params, RequestLocales>,
    private readonly options: I18nBuilderMultiOptions<Schema, RequestLocales> | undefined,
    private readonly state: MultiBuilderState<Schema, RequestLocales, NsList> & { locale: Locale }
  ) {}

  async load(): Promise<
    I18nScopeMultiForLocale<
      SchemaForNamespaces<Schema, NsList>,
      ParamsForNamespaces<Schema, Params, NsList>,
      RequestLocales,
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
