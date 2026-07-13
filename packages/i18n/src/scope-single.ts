import type { IcuTranslationProviderSingle } from "./IcuTranslationProviderSingle.js";
import type { KeyDictionary, LocaleFallbackMap, LocaleOfSingle } from "./types.js";
import type { ParamArgs } from "./scope-types.js";

/** Type-safe translation scope for a single-namespace schema. */
export interface I18nScopeSingle<
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
  ): I18nScopeSingleForLocale<Schema, Params, Locale>;
}

/** Single-namespace scope with a bound locale — `t(key)` and `set(key)` without a locale argument. */
export interface I18nScopeSingleForLocale<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  Locale extends string,
> {
  readonly locale: Locale;
  t<const K extends keyof Schema & string>(key: K, ...params: ParamArgs<Params[K]>): string;
  forLocale<Next extends Locale>(locale: Next): I18nScopeSingleForLocale<Schema, Params, Next>;
}

export class I18nScopeSingleImpl<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string,
  Fallback extends LocaleFallbackMap | undefined,
> implements I18nScopeSingle<Schema, Params, RequestLocales> {
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
  ): I18nScopeSingleForLocaleImpl<Schema, Params, RequestLocales, Locale, Fallback> {
    return new I18nScopeSingleForLocaleImpl(this.engine, locale);
  }
}

export class I18nScopeSingleForLocaleImpl<
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
  ): I18nScopeSingleForLocaleImpl<Schema, Params, RequestLocales, Next, Fallback> {
    return new I18nScopeSingleForLocaleImpl(this.engine, locale);
  }
}
