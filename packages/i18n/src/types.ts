import type { IntlMessageFormat } from "intl-messageformat";

export type LocaleDictionary = Record<string, string>;
export type KeyDictionary = Record<string, LocaleDictionary>;
export type MultiDictionary = Record<string, KeyDictionary>;

export type LocaleOfSingle<Schema extends KeyDictionary> = {
  [K in keyof Schema]: keyof Schema[K];
}[keyof Schema] &
  string;

export type LocaleOfMulti<Schema extends MultiDictionary> = {
  [NS in keyof Schema]: {
    [K in keyof Schema[NS]]: keyof Schema[NS][K];
  }[keyof Schema[NS]];
}[keyof Schema] &
  string;

export type LocaleFallbackMap = Record<string, string | null>;

export type RequestLocale<
  DictionaryLocale extends string,
  Fallback extends LocaleFallbackMap | undefined = undefined,
> = DictionaryLocale | (Fallback extends LocaleFallbackMap ? keyof Fallback & string : never);

export type IcuTranslationProviderOptions<
  Fallback extends LocaleFallbackMap | undefined = undefined,
> = {
  localeFallback?: Fallback;
};

export type LocaleCache = Record<string, IntlMessageFormat>;
export type SingleCompiledCache = Record<string, LocaleCache>;
export type MultiCompiledCache = Record<string, Record<string, LocaleCache>>;
