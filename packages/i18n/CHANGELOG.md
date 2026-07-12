# @xndrjs/i18n

## 0.6.1

### Patch Changes

- ### Patch Changes
  - **Runtime:** add `mergeNamespace()` on `IcuTranslationProviderMulti` — merges locale entries per translation key instead of replacing the whole namespace. Export `mergeNamespaceLocalesCore` for tooling.
  - **Split-by-locale / custom:** generated `ensureNamespacesLoadedForLocale` and `ensureNamespacesLoadedForArea` call `mergeNamespace()` so loading another locale or delivery area accumulates translations instead of dropping prior locales.
  - **Codegen:** `I18nMultiInstance` in `namespace-loaders.generated.ts` is typed as `TranslationProviderMulti<…>` (public interface). Re-run `xndrjs-i18n-codegen` after upgrading.

## 0.6.0

### Minor Changes

- 2f6cdd7: ### Breaking Changes (codegen output — re-run `xndrjs-i18n-codegen` after upgrading)
  - **Split-by-locale / custom (all lazy namespaces):** codegen no longer emits an empty `dictionary.generated.ts`. Start providers with `createI18n({})` and register namespaces via the generated helpers below. Remove `export * from "./dictionary.generated"` (or equivalent imports) when the file is omitted.
  - **`loadOnInit` is canonical-only:** configs with `delivery: "split-by-locale"` or `delivery: "custom"` must not set `loadOnInit`; codegen fails validation otherwise. Those modes always load namespaces through lazy loaders.
  - Generated `dictionary-schema.generated.ts` imports the validation helper as `validateExternalNamespaceCore` (was `validateExternalNamespaceImpl`). Public API remains `validateExternalNamespace`.

  ### Minor Changes
  - **Split-by-locale:** codegen emits `ensureNamespacesLoadedForLocale(i18n, locale, namespaces?)` in `namespace-loaders.generated.ts` — registers missing lazy namespaces on a shared `i18n` instance via `setNamespace()`.
  - **Custom delivery:** codegen emits `ensureNamespacesLoadedForArea(i18n, area, namespaces?)` with the same semantics for delivery areas.
  - Default `namespaces` argument lists all lazy namespaces (sorted). Pass a subset for route-scoped loading.

### Patch Changes

- 2079ab3: ### Patch Changes
  - **Split-by-locale / custom:** generated `ensureNamespacesLoadedForLocale` and `ensureNamespacesLoadedForArea` always call `setNamespace()` — removed the `hasNamespace` early return that blocked reloading when switching locale or delivery area on a shared `i18n` instance.
  - **Custom delivery:** codegen emits strongly typed `DELIVERY_ARTIFACTS` and `{SchemaPrefix}DeliveryArtifacts` in `i18n-types.generated.ts` (area → locales map from `deliveryArtifacts` config). Re-run `xndrjs-i18n-codegen` after upgrading.
  - **`dictionaryOutput` is optional** when `dictionary.generated.ts` is not emitted (split/custom with all lazy namespaces). Defaults to `{dirname(typesOutput)}/dictionary.generated.ts` for stale-file cleanup only.
  - **Split-by-locale / custom loaders:** generated `namespaceLoaders` switch statements throw if locale/area does not match a known artifact (no silent `undefined` into `setNamespace`). Re-run `xndrjs-i18n-codegen` after upgrading.

## 0.6.0-alpha.1

### Patch Changes

- 2079ab3: ### Patch Changes
  - **Split-by-locale / custom:** generated `ensureNamespacesLoadedForLocale` and `ensureNamespacesLoadedForArea` always call `setNamespace()` — removed the `hasNamespace` early return that blocked reloading when switching locale or delivery area on a shared `i18n` instance.
  - **Custom delivery:** codegen emits strongly typed `DELIVERY_ARTIFACTS` and `{SchemaPrefix}DeliveryArtifacts` in `i18n-types.generated.ts` (area → locales map from `deliveryArtifacts` config). Re-run `xndrjs-i18n-codegen` after upgrading.
  - **`dictionaryOutput` is optional** when `dictionary.generated.ts` is not emitted (split/custom with all lazy namespaces). Defaults to `{dirname(typesOutput)}/dictionary.generated.ts` for stale-file cleanup only.
  - **Split-by-locale / custom loaders:** generated `namespaceLoaders` switch statements throw if locale/area does not match a known artifact (no silent `undefined` into `setNamespace`). Re-run `xndrjs-i18n-codegen` after upgrading.

## 0.6.0-alpha.0

### Minor Changes

- 2f6cdd7: ### Breaking Changes (codegen output — re-run `xndrjs-i18n-codegen` after upgrading)
  - **Split-by-locale / custom (all lazy namespaces):** codegen no longer emits an empty `dictionary.generated.ts`. Start providers with `createI18n({})` and register namespaces via the generated helpers below. Remove `export * from "./dictionary.generated"` (or equivalent imports) when the file is omitted.
  - **`loadOnInit` is canonical-only:** configs with `delivery: "split-by-locale"` or `delivery: "custom"` must not set `loadOnInit`; codegen fails validation otherwise. Those modes always load namespaces through lazy loaders.
  - Generated `dictionary-schema.generated.ts` imports the validation helper as `validateExternalNamespaceCore` (was `validateExternalNamespaceImpl`). Public API remains `validateExternalNamespace`.

  ### Minor Changes
  - **Split-by-locale:** codegen emits `ensureNamespacesLoadedForLocale(i18n, locale, namespaces?)` in `namespace-loaders.generated.ts` — loads or updates lazy namespaces on a shared `i18n` instance via `setNamespace()`.
  - **Custom delivery:** codegen emits `ensureNamespacesLoadedForArea(i18n, area, namespaces?)` with the same semantics for delivery areas.
  - Default `namespaces` argument lists all lazy namespaces (sorted). Pass a subset for route-scoped loading.

## 0.5.0

### Minor Changes

- ### Breaking Changes
  - Align locale and delivery-area projection naming across `@xndrjs/i18n` and codegen output:
    - **Generated:** `projectDictionaryLocales`, `projectNamespaceLocales` (multi), `projectDictionaryForDeliveryArea`, `projectNamespaceForDeliveryArea` (multi + `delivery: "custom"` only). Replaces generated `projectLocales`.
    - **Library (tooling):** `projectNamespaceLocalesCore`, `projectDictionaryLocalesCore`, `projectNamespaceForDeliveryAreaCore`, `projectDictionaryForDeliveryAreaCore`. Replaces `projectLocales`, `projectNamespacesLocales`, and the previous non-`Core` delivery-area exports.
  - Generated wrappers now import matching `*Core` functions directly (no cross-wired aliases). Re-run codegen after upgrading.

  ### Minor Changes
  - Add `delivery` to `i18n.codegen.json`: `"canonical"` (default), `"split-by-locale"`, or `"custom"`. Authoring stays canonical; codegen materializes delivery artifacts under `{deliveryOutput}/translations/`.
  - Add optional `deliveryOutput` (defaults to `dirname(typesOutput)`). Use e.g. `public/i18n` to ship per-locale or per-area JSON from a static host.
  - **Split-by-locale:** emits `{basename}.{locale}.json`, exports `defaultDictionaryFor(locale)`, and typed `namespaceLoaders.billing(locale)` instead of `namespaceLoaders.billing()`.
  - **Custom:** declare named delivery areas in `deliveryArtifacts` (e.g. `eu`, `amer`); codegen emits `{basename}.{area}.json`, `defaultDictionaryFor(area)`, area-scoped loaders, and `projectDictionaryForDeliveryArea` / `projectNamespaceForDeliveryArea` helpers.
  - `MyProjectSchema` is now emitted explicitly as `Partial<Record<MyProjectLocale, string>>` per key (no `typeof import` of dictionary JSON), so split delivery and YAML authoring typecheck without duplicate JSON sources. Audit still reads canonical config paths.
  - Export `@xndrjs/i18n/codegen` for tooling that reuses codegen config and dictionary readers without the CLI binaries.

## 0.5.0

### Breaking Changes

- Align locale and delivery-area projection naming across `@xndrjs/i18n` and codegen output:
  - **Generated:** `projectDictionaryLocales`, `projectNamespaceLocales` (multi), `projectDictionaryForDeliveryArea`, `projectNamespaceForDeliveryArea` (multi + `delivery: "custom"` only). Replaces generated `projectLocales`.
  - **Library (tooling):** `projectNamespaceLocalesCore`, `projectDictionaryLocalesCore`, `projectNamespaceForDeliveryAreaCore`, `projectDictionaryForDeliveryAreaCore`. Replaces `projectLocales`, `projectNamespacesLocales`, and the previous non-`Core` delivery-area exports.
- Generated wrappers now import matching `*Core` functions directly (no cross-wired aliases). Re-run codegen after upgrading.

### Minor Changes

- Add optional `deliveryOutput` to `i18n.codegen.json`: directory for compiled and split delivery JSON (under `{deliveryOutput}/translations/`). Defaults to `dirname(typesOutput)` when omitted.

- Add `delivery` to `i18n.codegen.json`: `"canonical"` (default, unchanged behavior) or `"split-by-locale"`. Split mode emits `{basename}.{locale}.json` under `generated/translations/` using the same projection as `projectNamespaceLocalesCore` (including `localeFallback`). Codegen exports `defaultDictionaryFor(locale)` instead of `defaultDictionary`, and nested `namespaceLoaders.billing(locale)` instead of `namespaceLoaders.billing()`. `MyProjectSchema` is now emitted explicitly as `Partial<Record<MyProjectLocale, string>>` per key (no `typeof import` of dictionary JSON), so split delivery and YAML authoring typecheck without duplicate JSON sources. Audit still reads canonical config paths. Opt-in only — re-run codegen after upgrading.

## 0.4.0

### Minor Changes

- 1f56ce8: Remove `ensureNamespacesLoaded` / `ensureNamespacesLoadedImpl`. Lazy namespaces are registered via generated `namespaceLoaders` and `setNamespace()` — no runtime validation on trusted codegen JSON imports. `dictionarySchemaOutput` is optional for lazy loading; use it only for external CMS/API hydration. Breaking: re-run codegen and replace `ensureNamespacesLoaded(i18n, …)` with `namespaceLoaders` + `setNamespace()` (optionally `projectNamespaceLocales` before register).

- **Breaking (codegen output).** Generated `createI18n` no longer imports the fallback dictionary: the `dictionary` argument is required, so each call site chooses the data source (codegen fallback, lazy loaders, CMS, etc.) and `instance.generated.ts` does not pull JSON into the FE bundle by default.

  Codegen now exports `defaultDictionary` (was `dictionary`) from `dictionary.generated.ts`. Re-run codegen and update `i18n/index.ts` (or your factory module) to pass `defaultDictionary` explicitly, e.g. `createI18n(defaultDictionary)`.

  Setup scaffold (`xndrjs-i18n-setup`) emits the same pattern.

## 0.3.3

### Patch Changes

- 15ce5ce: Validate `i18n.codegen.json` with a strict Zod schema in `loadConfig` (codegen and audit). Unknown keys and invalid values fail with a formatted issue report; allowed keys are derived from the schema shape so the list cannot drift from validation rules.

  `zod` is now a **required** peer dependency (no longer optional): install it alongside `tsx` for codegen and audit.

## 0.3.3-alpha.0

### Patch Changes

- 15ce5ce: Validate `i18n.codegen.json` with a strict Zod schema in `loadConfig` (codegen and audit). Unknown keys and invalid values fail with a formatted issue report; allowed keys are derived from the schema shape so the list cannot drift from validation rules.

## 0.3.2

### Patch Changes

- Add locale projection helpers: `projectLocales` and `projectNamespacesLocales` in the runtime package. Codegen emits typed wrappers in `instance.generated.ts` — `projectLocales` for the full schema (`setAll`), and in multi mode `projectNamespaceLocales` per namespace (`setNamespace`) — with `LOCALE_FALLBACK` wired in automatically.

## 0.3.1

### Patch Changes

- Add `projectLocales(dictionary, locales, localeFallback?)` to build a dictionary containing only the requested locales, filling missing entries via the same fallback resolution as runtime `.get()`. Codegen now also emits a typed `projectLocales` wrapper in `instance.generated.ts` that wires in `LOCALE_FALLBACK` automatically.

## 0.3.0

### Minor Changes

- 48825fa: Add `importExtension` to `i18n.codegen.json` to control relative import suffixes between generated modules (`"none"`, `".ts"`, or `".js"`). Defaults to `"none"` for bundler-style projects; use `".js"` for `moduleResolution: "NodeNext"`. Setup scaffolds `i18n/index.ts` with the same default.
- c99ca5c: Add `xndrjs-i18n-audit` CLI to report missing translations (`missingDirectByLocale` vs `missingEffectiveByLocale`) against generated `MyProjectLocale`. Default is report-only (exit 0); optional `--fail-on effective|direct|any` for CI.

  When `localeFallback` is set in config, codegen now enriches generated `LOCALE_FALLBACK` with `[locale]: null` for every locale in `MyProjectLocale` not explicitly listed (runtime behavior unchanged).

- c17a3f4: Add YAML dictionary authoring (`.yaml` / `.yml`). Codegen compiles YAML sources to JSON under `{dirname(typesOutput)}/translations/` and keeps generated runtime imports JSON-based. Supports mixed JSON/YAML namespaces and multiline ICU strings.

## 0.2.1

### Patch Changes

- e7c1320: fix(i18n): cross-locale ICU variable merge

## 0.2.0

### Patch Changes

- 0c5e764: Setup CLI scaffolds `i18n/` under the target directory (no hardcoded `src/`); codegen default config is `i18n/i18n.codegen.json`. Next-steps output suggests a package script without binding to a specific package manager.

## 0.2.0-alpha.1

### Patch Changes

- 0c5e764: Setup CLI scaffolds `i18n/` under the target directory (no hardcoded `src/`); codegen default config is `i18n/i18n.codegen.json`. Next-steps output suggests a package script without binding to a specific package manager.

## 0.2.0-alpha.0

### Minor Changes

- b0be49d: Initial public alpha release: compiler-first ICU i18n with single/multi namespace providers, runtime dictionary override, external validation (Zod 4), and lazy namespace loading via `loadOnInit` + `ensureNamespacesLoaded`.

## 0.1.0

Initial public alpha. API may change before 1.0.

### Features

- Type-safe ICU MessageFormat runtime (`IcuTranslationProviderSingle` / `Multi`)
- Build-time codegen CLI (`xndrjs-i18n-codegen`)
- Runtime `setAll` / `setNamespace` with compilation cache invalidation
- Optional external dictionary validation (`@xndrjs/i18n/validation`, Zod 4 peer)
- Lazy namespace loading (`loadOnInit`, `ensureNamespacesLoaded`) in multi mode
- Locale fallback chains

### Requirements

- Node.js >= 18
- `tsx` peer for codegen CLI
- `zod` optional peer for generated validation helpers
