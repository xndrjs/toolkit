import type { IcuTranslationProviderSingle } from "./IcuTranslationProviderSingle.js";
import type { KeyDictionary, LocaleFallbackMap, LocaleOfSingle } from "./types.js";
import type { ParamArgs } from "./view-types.js";

/** Read-only, type-safe translation view for a single-namespace schema. */
export interface I18nViewSingle<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
> {
  t<const K extends keyof Schema & string>(
    key: K,
    locale: RequestLocales,
    ...params: ParamArgs<Params[K]>
  ): string;
  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nViewSingleForLocale<Schema, Params, Locale>;
}

/** Single-namespace view with a bound locale — `t(key)` without a locale argument. */
export interface I18nViewSingleForLocale<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  Locale extends string,
> {
  readonly locale: Locale;
  t<const K extends keyof Schema & string>(key: K, ...params: ParamArgs<Params[K]>): string;
  forLocale<Next extends Locale>(locale: Next): I18nViewSingleForLocale<Schema, Params, Next>;
}

export class I18nViewSingleImpl<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string,
  Fallback extends LocaleFallbackMap | undefined,
> implements I18nViewSingle<Schema, Params, RequestLocales> {
  constructor(
    private readonly engine: IcuTranslationProviderSingle<Schema, Params, RequestLocales, Fallback>
  ) {}

  t<const K extends keyof Schema & string>(
    key: K,
    locale: RequestLocales,
    ...args: ParamArgs<Params[K]>
  ): string {
    const params = args[0] as Record<string, unknown> | undefined;
    return this.engine.getWithLocale(String(key), locale, params);
  }

  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nViewSingleForLocaleImpl<Schema, Params, RequestLocales, Locale, Fallback> {
    return new I18nViewSingleForLocaleImpl(this.engine, locale);
  }
}

export class I18nViewSingleForLocaleImpl<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string,
  Locale extends RequestLocales,
  Fallback extends LocaleFallbackMap | undefined,
> {
  constructor(
    private readonly engine: IcuTranslationProviderSingle<Schema, Params, RequestLocales, Fallback>,
    readonly locale: Locale
  ) {}

  t<const K extends keyof Schema & string>(key: K, ...args: ParamArgs<Params[K]>): string {
    const params = args[0] as Record<string, unknown> | undefined;
    return this.engine.getWithLocale(String(key), this.locale, params);
  }

  forLocale<Next extends Locale>(
    locale: Next
  ): I18nViewSingleForLocaleImpl<Schema, Params, RequestLocales, Next, Fallback> {
    return new I18nViewSingleForLocaleImpl(this.engine, locale);
  }
}
