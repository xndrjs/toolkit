import { invokeNamespaceLoader, type NamespaceLoader } from "./builder-loaders.js";
import type { I18nEngineSingleImpl } from "./engine.js";
import type {
  KeyDictionary,
  LocaleFallbackMap,
  LocaleOfSingle,
  PartialKeyDictionary,
} from "./types.js";
import type { I18nScopeSingleForLocaleImpl, I18nScopeSingleImpl } from "./scope-single.js";

type SingleScopeBound<
  Schema extends KeyDictionary,
  Params,
  Locale extends string,
> = I18nScopeSingleForLocaleImpl<
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

  load(): Promise<
    I18nScopeSingleImpl<Schema, Params, RequestLocales, LocaleFallbackMap | undefined>
  >;
}

export interface I18nBuilderSingleForLocale<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  Locale extends string,
> {
  load(): Promise<SingleScopeBound<Schema, Params, Locale>>;
}

type SingleBuilderState<
  Schema extends KeyDictionary,
  RequestLocales extends string = LocaleOfSingle<Schema>,
> = {
  locale?: RequestLocales;
  deliveryArea?: string;
};

export class I18nBuilderSingleImpl<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
> implements I18nBuilderSingle<Schema, Params, RequestLocales> {
  private state: SingleBuilderState<Schema, RequestLocales> = {};

  constructor(
    private readonly engine: I18nEngineSingleImpl<Schema, Params, RequestLocales>,
    private readonly options?: I18nBuilderSingleOptions<Schema, RequestLocales>,
    state?: SingleBuilderState<Schema, RequestLocales>
  ) {
    if (state !== undefined) {
      this.state = {
        ...(state.locale !== undefined ? { locale: state.locale } : {}),
        ...(state.deliveryArea !== undefined ? { deliveryArea: state.deliveryArea } : {}),
      };
    }
  }

  private clone(): SingleBuilderState<Schema, RequestLocales> {
    return {
      ...(this.state.locale !== undefined ? { locale: this.state.locale } : {}),
      ...(this.state.deliveryArea !== undefined ? { deliveryArea: this.state.deliveryArea } : {}),
    };
  }

  withLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nBuilderSingleForLocaleImpl<Schema, Params, RequestLocales, Locale> {
    const { deliveryArea: _deliveryArea, ...rest } = this.clone();
    return new I18nBuilderSingleForLocaleImpl<Schema, Params, RequestLocales, Locale>(
      this.engine,
      this.options,
      { ...rest, locale }
    );
  }

  withDeliveryArea<Area extends string>(
    _area: Area
  ): I18nBuilderSingle<Schema, Params, RequestLocales> {
    const { locale: _locale, ...rest } = this.clone();
    return new I18nBuilderSingleImpl(this.engine, this.options, {
      ...rest,
      deliveryArea: _area,
    });
  }

  async load(): Promise<
    I18nScopeSingleImpl<Schema, Params, RequestLocales, LocaleFallbackMap | undefined>
  > {
    await applySingleBuilderLoad(this.engine, this.options, this.state);
    return this.engine.toScope();
  }
}

export class I18nBuilderSingleForLocaleImpl<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
  Locale extends RequestLocales = RequestLocales,
> implements I18nBuilderSingleForLocale<Schema, Params, Locale> {
  constructor(
    private readonly engine: I18nEngineSingleImpl<Schema, Params, RequestLocales>,
    private readonly options: I18nBuilderSingleOptions<Schema, RequestLocales> | undefined,
    private readonly state: SingleBuilderState<Schema, RequestLocales> & { locale: Locale }
  ) {}

  async load() {
    await applySingleBuilderLoad(this.engine, this.options, this.state);
    return this.engine.toScope().forLocale(this.state.locale);
  }
}

async function applySingleBuilderLoad<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string,
>(
  engine: I18nEngineSingleImpl<Schema, Params, RequestLocales>,
  options: I18nBuilderSingleOptions<Schema, RequestLocales> | undefined,
  state: SingleBuilderState<Schema, RequestLocales>
): Promise<void> {
  const partition = state.locale ?? state.deliveryArea;
  const loader = options?.dictionaryLoader;

  if (loader !== undefined) {
    const data = await invokeNamespaceLoader(loader, partition);
    engine.applyLoadMergeSingle(data);
  }
}
