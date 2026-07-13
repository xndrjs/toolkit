import type { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import type { LocaleFallbackMap, LocaleOfMulti, MultiDictionary } from "./types.js";
import type { MultiParams } from "./view-types.js";

/** Read-only, type-safe translation view for a multi-namespace schema subset. */
export interface I18nViewMulti<
  Schema extends MultiDictionary,
  Params,
  RequestLocales extends string = LocaleOfMulti<Schema>,
> {
  t<
    NS extends keyof Schema & keyof Params & string,
    K extends keyof Schema[NS] & keyof Params[NS] & string,
  >(
    namespace: NS,
    key: K,
    locale: RequestLocales,
    ...params: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
  ): string;
  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nViewMultiForLocale<Schema, Params, RequestLocales, Locale>;
}

/** Multi-namespace view with a bound locale — `t(namespace, key)` without a locale argument. */
export interface I18nViewMultiForLocale<
  Schema extends MultiDictionary,
  Params,
  RequestLocales extends string,
  Locale extends RequestLocales,
> {
  readonly locale: Locale;
  t<
    NS extends keyof Schema & keyof Params & string,
    K extends keyof Schema[NS] & keyof Params[NS] & string,
  >(
    namespace: NS,
    key: K,
    ...params: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
  ): string;
  forLocale<Next extends RequestLocales>(
    locale: Next
  ): I18nViewMultiForLocale<Schema, Params, RequestLocales, Next>;
}

export class I18nViewMultiImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  Fallback extends LocaleFallbackMap | undefined,
> implements I18nViewMulti<Schema, Params, RequestLocales> {
  constructor(
    private readonly engine: IcuTranslationProviderMulti<Schema, Params, RequestLocales, Fallback>
  ) {}

  t<NS extends keyof Schema, K extends keyof Schema[NS] & keyof Params[NS] & string>(
    namespace: NS,
    key: K,
    locale: RequestLocales,
    ...args: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
  ): string {
    const params = args[0] as Record<string, unknown> | undefined;
    return this.engine.getWithLocale(String(namespace), String(key), locale, params);
  }

  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nViewMultiForLocaleImpl<Schema, Params, RequestLocales, Locale, Fallback> {
    return new I18nViewMultiForLocaleImpl(this.engine, locale);
  }
}

export class I18nViewMultiForLocaleImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  Locale extends RequestLocales,
  Fallback extends LocaleFallbackMap | undefined,
> implements I18nViewMultiForLocale<Schema, Params, RequestLocales, Locale> {
  constructor(
    private readonly engine: IcuTranslationProviderMulti<Schema, Params, RequestLocales, Fallback>,
    readonly locale: Locale
  ) {}

  t<NS extends keyof Schema, K extends keyof Schema[NS] & keyof Params[NS] & string>(
    namespace: NS,
    key: K,
    ...args: Params[NS][K] extends never ? [] : [params: Params[NS][K]]
  ): string {
    const params = args[0] as Record<string, unknown> | undefined;
    return this.engine.getWithLocale(String(namespace), String(key), this.locale, params);
  }

  forLocale<Next extends RequestLocales>(
    locale: Next
  ): I18nViewMultiForLocaleImpl<Schema, Params, RequestLocales, Next, Fallback> {
    return new I18nViewMultiForLocaleImpl(this.engine, locale);
  }
}
