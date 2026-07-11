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

export type MissingTranslationContext = {
  /** Only set by the multi-namespace provider. */
  namespace?: string;
  key: string;
  locale: string;
  fallbackChain: string;
};

export type OnMissingTranslation =
  | "throw"
  | "key"
  | ((context: MissingTranslationContext) => string);

export type IcuTranslationProviderOptions<
  Fallback extends LocaleFallbackMap | undefined = undefined,
> = {
  localeFallback?: Fallback;
  /**
   * Strategy when no template resolves for a key/locale (after walking the
   * fallback chain). "throw" (default) raises an error, "key" returns the
   * translation key itself, a function receives the context and returns the
   * string to display. ICU syntax and formatting errors always throw.
   */
  onMissing?: OnMissingTranslation;
};

export type LocaleCache = Record<string, IntlMessageFormat>;
export type SingleCompiledCache = Record<string, LocaleCache>;
export type MultiCompiledCache = Record<string, Record<string, LocaleCache>>;
