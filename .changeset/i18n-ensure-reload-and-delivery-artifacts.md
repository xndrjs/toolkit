---
"@xndrjs/i18n": patch
---

### Patch Changes

- **Split-by-locale / custom:** generated `ensureNamespacesLoadedForLocale` and `ensureNamespacesLoadedForArea` always call `setNamespace()` — removed the `hasNamespace` early return that blocked reloading when switching locale or delivery area on a shared `i18n` instance.
- **Custom delivery:** codegen emits strongly typed `DELIVERY_ARTIFACTS` and `{SchemaPrefix}DeliveryArtifacts` in `i18n-types.generated.ts` (area → locales map from `deliveryArtifacts` config). Re-run `xndrjs-i18n-codegen` after upgrading.
- **`dictionaryOutput` is optional** when `dictionary.generated.ts` is not emitted (split/custom with all lazy namespaces). Defaults to `{dirname(typesOutput)}/dictionary.generated.ts` for stale-file cleanup only.
- **Split-by-locale / custom loaders:** generated `namespaceLoaders` switch statements throw if locale/area does not match a known artifact (no silent `undefined` into `setNamespace`). Re-run `xndrjs-i18n-codegen` after upgrading.
