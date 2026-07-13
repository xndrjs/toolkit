import { cloneAndFreeze } from "./deep-freeze.js";
import { BuilderLoadRegistry, SINGLE_BUILDER_RESOURCE } from "./builder-load-registry.js";
import type { I18nEngineSingle } from "./engine.js";
import { resolveAndFormat } from "./format-core.js";
import {
  assertPatchKeySingle,
  recordPreloadedKeysSingle,
  seedPreloadedKeysSingle,
} from "./patch-key.js";
import { mergeNamespaceLocalesCore } from "./project-locales.js";
import { validateLocaleFallback } from "./resolve-locale.js";
import type {
  IcuTranslationProviderOptions,
  KeyDictionary,
  LocaleFallbackMap,
  LocaleOfSingle,
  OnMissingTranslation,
  SingleCompiledCache,
  PartialKeyDictionary,
} from "./types.js";
import { I18nScopeSingleForLocaleImpl, I18nScopeSingleImpl } from "./scope-single.js";

export class IcuTranslationProviderSingle<
  Schema extends KeyDictionary,
  Params extends { [K in keyof Schema]: unknown },
  RequestLocales extends string = LocaleOfSingle<Schema>,
  Fallback extends LocaleFallbackMap | undefined = undefined,
> implements I18nEngineSingle<Schema, Params, RequestLocales> {
  readonly __i18nEngineMode = "single" as const;

  private dictionary: Schema;
  private compiledCache: SingleCompiledCache = {};
  private readonly preloadedKeys = new Set<string>();
  private readonly builderLoadRegistry = new BuilderLoadRegistry();
  private readonly localeFallback?: Fallback;
  private readonly onMissing: OnMissingTranslation;

  constructor(dictionary: Schema, options?: IcuTranslationProviderOptions<Fallback>) {
    this.dictionary = structuredClone(dictionary);
    seedPreloadedKeysSingle(this.dictionary, this.preloadedKeys);
    if (options?.localeFallback) {
      validateLocaleFallback(options.localeFallback);
      this.localeFallback = options.localeFallback;
    }
    this.onMissing = options?.onMissing ?? "throw";
  }

  getWithLocale(key: string, locale: string, params?: Record<string, unknown>): string {
    return resolveAndFormat({
      localeByKey: this.dictionary[key],
      locale,
      params,
      getCache: (resolvedLocale) => {
        if (!this.compiledCache[resolvedLocale]) {
          this.compiledCache[resolvedLocale] = {};
        }
        return this.compiledCache[resolvedLocale]!;
      },
      context: {
        key,
        locale,
        localeFallback: this.localeFallback,
        onMissing: this.onMissing,
      },
    });
  }

  toScope(): I18nScopeSingleImpl<Schema, Params, RequestLocales, Fallback>;
  toScope<Locale extends RequestLocales>(options: {
    locale: Locale;
  }): I18nScopeSingleForLocaleImpl<Schema, Params, RequestLocales, Locale, Fallback>;
  toScope<Locale extends RequestLocales>(options?: { locale?: Locale }) {
    if (options?.locale !== undefined) {
      return new I18nScopeSingleForLocaleImpl(this, options.locale);
    }
    return new I18nScopeSingleImpl(this);
  }

  getAll(): Schema {
    return cloneAndFreeze(this.dictionary);
  }

  hasBuilderResourceLoaded(partition: string | undefined): boolean {
    return this.builderLoadRegistry.has(SINGLE_BUILDER_RESOURCE, partition);
  }

  markBuilderResourceLoaded(partition: string | undefined): void {
    this.builderLoadRegistry.mark(SINGLE_BUILDER_RESOURCE, partition);
  }

  applyLoadMergeSingle(values: PartialKeyDictionary<Schema, RequestLocales>): void {
    this.dictionary = mergeNamespaceLocalesCore(this.dictionary, values);
    recordPreloadedKeysSingle(values, this.preloadedKeys);

    for (const [key, incomingLocales] of Object.entries(values)) {
      if (incomingLocales === undefined || typeof incomingLocales !== "object") {
        continue;
      }

      for (const locale of Object.keys(incomingLocales)) {
        delete this.compiledCache[locale]?.[key];
      }
    }
  }

  patchKey(key: string, locale: string, template: string): void {
    assertPatchKeySingle(key, locale, template, this.preloadedKeys, this.dictionary[key]);

    this.dictionary = mergeNamespaceLocalesCore(this.dictionary, {
      [key]: { [locale]: template },
    } as PartialKeyDictionary<Schema, RequestLocales>);
    delete this.compiledCache[locale]?.[key];
  }
}
