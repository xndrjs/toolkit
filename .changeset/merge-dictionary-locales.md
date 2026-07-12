---
"@xndrjs/i18n": patch
---

- **Runtime:** add `mergeNamespace()` on `IcuTranslationProviderMulti` and `mergeAll()` on both `IcuTranslationProviderSingle` and `IcuTranslationProviderMulti` — merge locale entries per translation key instead of replacing the whole namespace (multi) or dictionary (single). Use as an alternative to `setNamespace()` / `setAll()` when accumulating locales on the same instance.
- **Runtime:** export `mergeNamespaceLocalesCore` and `mergeDictionaryLocalesCore` for tooling.
- **Split-by-locale / custom:** generated `ensureNamespacesLoadedForLocale` and `ensureNamespacesLoadedForArea` call `mergeNamespace()` (multi) or `mergeAll()` (single) so loading another locale or delivery area accumulates translations instead of dropping prior locales.
- **Codegen:** emit `ensureNamespacesLoadedForLocale` / `ensureNamespacesLoadedForArea` in single mode too (previously multi only). Single-mode loaders are typed as `Promise<AppSchema>` instead of `Promise<AppSchema[K]>`.
- **Codegen:** `I18nMultiInstance` / `I18nSingleInstance` in `namespace-loaders.generated.ts` are typed as `TranslationProviderMulti<…>` / `TranslationProviderSingle<…>` (public interfaces). Re-run `xndrjs-i18n-codegen` after upgrading.
