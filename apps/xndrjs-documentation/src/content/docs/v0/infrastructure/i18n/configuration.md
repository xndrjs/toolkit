---
title: Configuration
description: i18n.codegen.json reference for @xndrjs/i18n.
---

## Example

```json
{
  "projectName": "MyProject",
  "namespaces": {
    "default": "translations/default.json",
    "user": "translations/user.json",
    "billing": "translations/billing.yaml"
  },
  "codegenPath": "generated",
  "delivery": "split-by-locale",
  "localeFallback": {
    "en": null,
    "de-DE": "en",
    "de-CH": "de-DE",
    "it": "en"
  }
}
```

Under `codegenPath/` codegen always writes:

- `i18n-types.generated.ts`
- `instance.generated.ts`
- `namespace-loaders.generated.ts`
- `dictionary-schema.generated.ts`

Type names are derived from `projectName`: `MyProjectParams`, `MyProjectSchema`, `MyProjectLocale`.

## Field reference

| Field               | Description                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectName`       | PascalCase project id. Infers `*Params` / `*Schema` / `*Locale` (and `*DeliveryArea` for custom delivery).                                                                         |
| `namespaces`        | Map of `namespace → dictionary path` (`.json`, `.yaml`, or `.yml`).                                                                                                                |
| `codegenPath`       | Directory for generated TypeScript modules (fixed basenames).                                                                                                                      |
| `artifactsPath`     | Optional. Directory for delivery JSON (`{artifactsPath}/translations/`). Defaults to `codegenPath`.                                                                                |
| `localeFallback`    | Optional `locale → next locale \| null` map. See [Locale fallback](/v0/infrastructure/i18n/locale-fallback/).                                                                      |
| `delivery`          | Optional. `"split-by-locale"` (default) or `"custom"`. See [Delivery](/v0/infrastructure/i18n/delivery/).                                                                          |
| `deliveryArtifacts` | Custom delivery only. Map of area name → locale list (for example `"eu": ["en", "it", "fr"]`).                                                                                     |
| `loaderStrategy`    | Optional. `"import"` (default) or `"fetch"`. Fetch requires `createI18n({ fetchImpl })` (resource id → JSON is app-owned) and enables CMS content updates without a types rebuild. |
