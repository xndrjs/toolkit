import { invokeNamespaceLoader, type NamespaceLoader } from "./builder-loaders.js";
import type { I18nEngineSingle } from "./engine.js";
import { IcuTranslationProviderSingle } from "./IcuTranslationProviderSingle.js";
import type {
  KeyDictionary,
  LocaleFallbackMap,
  LocaleOfSingle,
  PartialKeyDictionary,
} from "./types.js";
import type { I18nViewSingleForLocaleImpl, I18nViewSingleImpl } from "./view-single.js";

type SingleViewBound<
  Schema extends KeyDictionary,
  Params,
  Locale extends string,
> = I18nViewSingleForLocaleImpl<
  Schema,
  Params & { [K in keyof Schema]: unknown },
  LocaleOfSingle<Schema>,
  Locale,
  LocaleFallbackMap | undefined
>;

export type I18nBuilderSingleOptions<
  Schema extends KeyDictionary,
  RequestLocales extends string = LocaleOfSingle<Schema>,
> = {
  dictionaryLoader?: NamespaceLoader<PartialKeyDictionary<Schema, RequestLocales> | Schema>;
};

export interface I18nBuilderSingle<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
> {
  withLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nBuilderSingleForLocaleImpl<Schema, Params, RequestLocales, Locale>;

  withDeliveryArea<Area extends string>(
    area: Area
  ): I18nBuilderSingle<Schema, Params, RequestLocales>;

  withDictionaryData(
    data: PartialKeyDictionary<Schema, RequestLocales>
  ): I18nBuilderSingle<Schema, Params, RequestLocales>;

  load(): Promise<
    I18nViewSingleImpl<Schema, Params, RequestLocales, LocaleFallbackMap | undefined>
  >;
}

export interface I18nBuilderSingleForLocale<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  Locale extends string,
> {
  withDictionaryData(
    data: PartialKeyDictionary<Schema, LocaleOfSingle<Schema>>
  ): I18nBuilderSingleForLocale<Schema, Params, Locale>;

  load(): Promise<SingleViewBound<Schema, Params, Locale>>;
}

type SingleBuilderState<
  Schema extends KeyDictionary,
  RequestLocales extends string = LocaleOfSingle<Schema>,
> = {
  locale?: RequestLocales;
  deliveryArea?: string;
  dictionaryData: PartialKeyDictionary<Schema, RequestLocales>;
};

export class I18nBuilderSingleImpl<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
> implements I18nBuilderSingle<Schema, Params, RequestLocales> {
  private state: SingleBuilderState<Schema, RequestLocales> = {
    dictionaryData: {},
  };

  constructor(
    private readonly engine: I18nEngineSingle<Schema, Params, RequestLocales>,
    private readonly options?: I18nBuilderSingleOptions<Schema, RequestLocales>,
    state?: SingleBuilderState<Schema, RequestLocales>
  ) {
    if (state !== undefined) {
      this.state = {
        dictionaryData: { ...state.dictionaryData },
        ...(state.locale !== undefined ? { locale: state.locale } : {}),
        ...(state.deliveryArea !== undefined ? { deliveryArea: state.deliveryArea } : {}),
      };
    }
  }

  private clone(): SingleBuilderState<Schema, RequestLocales> {
    return {
      ...(this.state.locale !== undefined ? { locale: this.state.locale } : {}),
      ...(this.state.deliveryArea !== undefined ? { deliveryArea: this.state.deliveryArea } : {}),
      dictionaryData: { ...this.state.dictionaryData },
    };
  }

  withLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nBuilderSingleForLocaleImpl<Schema, Params, RequestLocales, Locale> {
    const state = this.clone();
    state.locale = locale;
    delete state.deliveryArea;
    return new I18nBuilderSingleForLocaleImpl<Schema, Params, RequestLocales, Locale>(
      this.engine,
      this.options,
      state
    );
  }

  withDeliveryArea<Area extends string>(
    _area: Area
  ): I18nBuilderSingle<Schema, Params, RequestLocales> {
    const state = this.clone();
    state.deliveryArea = _area;
    delete state.locale;
    return new I18nBuilderSingleImpl(this.engine, this.options, state);
  }

  withDictionaryData(
    data: PartialKeyDictionary<Schema, RequestLocales>
  ): I18nBuilderSingle<Schema, Params, RequestLocales> {
    const state = this.clone();
    state.dictionaryData = {
      ...state.dictionaryData,
      ...data,
    };
    return new I18nBuilderSingleImpl(this.engine, this.options, state);
  }

  async load(): Promise<
    I18nViewSingleImpl<Schema, Params, RequestLocales, LocaleFallbackMap | undefined>
  > {
    await applySingleBuilderLoad(this.engine, this.options, this.state);
    return (
      this.engine as unknown as IcuTranslationProviderSingle<Schema, Params, RequestLocales>
    ).toView();
  }
}

export class I18nBuilderSingleForLocaleImpl<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
  Locale extends RequestLocales = RequestLocales,
> implements I18nBuilderSingleForLocale<Schema, Params, Locale> {
  constructor(
    private readonly engine: I18nEngineSingle<Schema, Params, RequestLocales>,
    private readonly options: I18nBuilderSingleOptions<Schema, RequestLocales> | undefined,
    private readonly state: SingleBuilderState<Schema, RequestLocales>
  ) {}

  withDictionaryData(
    data: PartialKeyDictionary<Schema, RequestLocales>
  ): I18nBuilderSingleForLocale<Schema, Params, Locale> {
    return new I18nBuilderSingleForLocaleImpl(this.engine, this.options, {
      ...this.state,
      dictionaryData: {
        ...this.state.dictionaryData,
        ...data,
      },
    });
  }

  async load() {
    await applySingleBuilderLoad(this.engine, this.options, this.state);
    return (this.engine as unknown as IcuTranslationProviderSingle<Schema, Params, RequestLocales>)
      .toView()
      .forLocale(this.state.locale as Locale);
  }
}

async function applySingleBuilderLoad<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string,
>(
  engine: I18nEngineSingle<Schema, Params, RequestLocales>,
  options: I18nBuilderSingleOptions<Schema, RequestLocales> | undefined,
  state: SingleBuilderState<Schema, RequestLocales>
): Promise<void> {
  const partition = state.locale ?? state.deliveryArea;
  const loader = options?.dictionaryLoader;

  if (loader !== undefined) {
    const data = await invokeNamespaceLoader(loader, partition);
    engine.mergeAll(data as PartialKeyDictionary<Schema, RequestLocales>);
  }

  if (Object.keys(state.dictionaryData).length > 0) {
    engine.mergeAll(state.dictionaryData);
  }
}
