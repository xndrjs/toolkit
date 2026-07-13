import type { IcuTranslationProviderMulti } from "./IcuTranslationProviderMulti.js";
import type { LocaleFallbackMap, LocaleOfMulti, MultiDictionary } from "./types.js";
import type { MultiParams, ParamArgs } from "./scope-types.js";

/** Type-safe translation scope for a multi-namespace schema subset. */
export interface I18nScopeMulti<
  Schema extends MultiDictionary,
  Params,
  RequestLocales extends string = LocaleOfMulti<Schema>,
> {
  t<
    const NS extends keyof Schema & keyof Params & string,
    const K extends keyof Schema[NS] & keyof Params[NS] & string,
  >(
    namespace: NS,
    key: K,
    locale: RequestLocales,
    ...params: ParamArgs<Params[NS][K]>
  ): string;
  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nScopeMultiForLocale<Schema, Params, RequestLocales, Locale>;
}

/** Multi-namespace scope with a bound locale — `t(namespace, key)` and `set(...)` without a locale argument. */
export interface I18nScopeMultiForLocale<
  Schema extends MultiDictionary,
  Params,
  RequestLocales extends string,
  Locale extends RequestLocales,
> {
  readonly locale: Locale;
  t<
    const NS extends keyof Schema & keyof Params & string,
    const K extends keyof Schema[NS] & keyof Params[NS] & string,
  >(
    namespace: NS,
    key: K,
    ...params: ParamArgs<Params[NS][K]>
  ): string;
  set<
    const NS extends keyof Schema & keyof Params & string,
    const K extends keyof Schema[NS] & keyof Params[NS] & string,
  >(
    namespace: NS,
    key: K,
    template: string
  ): void;
  forLocale<Next extends RequestLocales>(
    locale: Next
  ): I18nScopeMultiForLocale<Schema, Params, RequestLocales, Next>;
}

export class I18nScopeMultiImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  Fallback extends LocaleFallbackMap | undefined,
> implements I18nScopeMulti<Schema, Params, RequestLocales> {
  constructor(
    private readonly engine: IcuTranslationProviderMulti<Schema, Params, RequestLocales, Fallback>
  ) {}

  t<
    const NS extends keyof Schema & keyof Params & string,
    const K extends keyof Schema[NS] & keyof Params[NS] & string,
  >(namespace: NS, key: K, locale: RequestLocales, ...args: ParamArgs<Params[NS][K]>): string {
    const params = args[0] as Record<string, unknown> | undefined;
    return this.engine.getWithLocale(String(namespace), String(key), locale, params);
  }

  forLocale<Locale extends RequestLocales>(
    locale: Locale
  ): I18nScopeMultiForLocaleImpl<Schema, Params, RequestLocales, Locale, Fallback> {
    return new I18nScopeMultiForLocaleImpl(this.engine, locale);
  }
}

export class I18nScopeMultiForLocaleImpl<
  Schema extends MultiDictionary,
  Params extends MultiParams<Schema>,
  RequestLocales extends string,
  Locale extends RequestLocales,
  Fallback extends LocaleFallbackMap | undefined,
> implements I18nScopeMultiForLocale<Schema, Params, RequestLocales, Locale> {
  constructor(
    private readonly engine: IcuTranslationProviderMulti<Schema, Params, RequestLocales, Fallback>,
    readonly locale: Locale
  ) {}

  t<
    const NS extends keyof Schema & keyof Params & string,
    const K extends keyof Schema[NS] & keyof Params[NS] & string,
  >(namespace: NS, key: K, ...args: ParamArgs<Params[NS][K]>): string {
    const params = args[0] as Record<string, unknown> | undefined;
    return this.engine.getWithLocale(String(namespace), String(key), this.locale, params);
  }

  set<
    const NS extends keyof Schema & keyof Params & string,
    const K extends keyof Schema[NS] & keyof Params[NS] & string,
  >(namespace: NS, key: K, template: string): void {
    this.engine.patchKeyMulti(String(namespace), String(key), this.locale, template);
  }

  forLocale<Next extends RequestLocales>(
    locale: Next
  ): I18nScopeMultiForLocaleImpl<Schema, Params, RequestLocales, Next, Fallback> {
    return new I18nScopeMultiForLocaleImpl(this.engine, locale);
  }
}
