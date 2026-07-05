# @xndrjs/i18n

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
