---
"@xndrjs/i18n": minor
---

### Breaking Changes (codegen output — re-run `xndrjs-i18n-codegen` after upgrading)

- **Split-by-locale / custom (all lazy namespaces):** codegen no longer emits an empty `dictionary.generated.ts`. Start providers with `createI18n({})` and register namespaces via the generated helpers below. Remove `export * from "./dictionary.generated"` (or equivalent imports) when the file is omitted.
- **`loadOnInit` is canonical-only:** configs with `delivery: "split-by-locale"` or `delivery: "custom"` must not set `loadOnInit`; codegen fails validation otherwise. Those modes always load namespaces through lazy loaders.
- Generated `dictionary-schema.generated.ts` imports the validation helper as `validateExternalNamespaceCore` (was `validateExternalNamespaceImpl`). Public API remains `validateExternalNamespace`.

### Minor Changes

- **Split-by-locale:** codegen emits `ensureNamespacesLoadedForLocale(i18n, locale, namespaces?)` in `namespace-loaders.generated.ts` — registers missing lazy namespaces on a shared `i18n` instance via `setNamespace()`.
- **Custom delivery:** codegen emits `ensureNamespacesLoadedForArea(i18n, area, namespaces?)` with the same semantics for delivery areas.
- Default `namespaces` argument lists all lazy namespaces (sorted). Pass a subset for route-scoped loading.
