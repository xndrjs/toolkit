# @xndrjs/i18n

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
