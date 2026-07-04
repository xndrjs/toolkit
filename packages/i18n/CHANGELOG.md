# @xndrjs/i18n

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
