---
title: Configuration
description: i18n.codegen.json reference for @xndrjs/i18n.
---

## Single-file

```json
{
  "dictionary": "translations/translations.json",
  "defaultNamespace": "default",
  "typesOutput": "generated/i18n-types.generated.ts",
  "dictionaryOutput": "generated/dictionary.generated.ts",
  "instanceOutput": "generated/instance.generated.ts",
  "paramsTypeName": "MyProjectParams",
  "schemaTypeName": "MyProjectSchema",
  "localeTypeName": "MyProjectLocale",
  "factoryName": "createI18n",
  "localeFallback": {
    "en": null,
    "de-DE": "en",
    "de-CH": "de-DE",
    "it": "en"
  }
}
```

## Multi-namespace

```json
{
  "namespaces": {
    "default": "translations/default.json",
    "user": "translations/user.json",
    "billing": "translations/billing.yaml"
  },
  "typesOutput": "generated/i18n-types.generated.ts",
  "dictionaryOutput": "generated/dictionary.generated.ts",
  "instanceOutput": "generated/instance.generated.ts",
  "paramsTypeName": "MyProjectParams",
  "schemaTypeName": "MyProjectSchema",
  "localeTypeName": "MyProjectLocale",
  "factoryName": "createI18n",
  "localeFallback": {
    "en": null,
    "de-DE": "en",
    "de-CH": "de-DE",
    "it": "en"
  }
}
```

## Field reference

| Field                               | Description                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dictionary`                        | Single dictionary path (`.json`, `.yaml`, or `.yml`). Mutually exclusive with `namespaces`.                                                      |
| `namespaces`                        | Map of `namespace → dictionary path` (`.json`, `.yaml`, or `.yml`). Mutually exclusive with `dictionary`.                                        |
| `defaultNamespace`                  | Single mode only. Internal label (default `"default"`). Not exposed in flat API.                                                                 |
| `typesOutput`                       | Generated types file path.                                                                                                                       |
| `deliveryOutput`                    | Optional. Directory for compiled and split delivery JSON (`{deliveryOutput}/translations/`). Defaults to `dirname(typesOutput)`.                 |
| `dictionaryOutput`                  | Optional. `dictionary.generated.ts` output when emitted; omit in split/custom with all lazy namespaces (stale default path is still cleaned up). |
| `instanceOutput`                    | Generated factory path.                                                                                                                          |
| `importExtension`                   | Optional. Relative import suffix between generated `.ts` modules: `"none"` (default), `".ts"`, or `".js"`.                                       |
| `factoryName`                       | Exported factory name (default `createI18n`).                                                                                                    |
| `paramsTypeName` / `schemaTypeName` | Generated type names.                                                                                                                            |
| `localeTypeName`                    | Generated locale union name (default `MyProjectLocale`).                                                                                         |
| `localeFallback`                    | Optional `locale → next locale \| null` map. See [Locale fallback](/v0/infrastructure/i18n/locale-fallback/).                                    |
| `localeFallbackConstName`           | Generated constant name (default `LOCALE_FALLBACK`).                                                                                             |
| `dictionarySchemaOutput`            | Optional validation schema output. Requires `zod`. See [External validation](/v0/infrastructure/i18n/validation/).                               |
| `loadOnInit`                        | Multi + canonical only. Namespaces in the initial bundle via static imports. Not allowed with `split-by-locale` or `custom`.                     |
| `namespaceLoadersOutput`            | Lazy loaders output. Required when lazy namespaces exist.                                                                                        |
| `delivery`                          | Optional. `"canonical"` (default), `"split-by-locale"`, or `"custom"`. See [Delivery](/v0/infrastructure/i18n/delivery/).                        |
| `deliveryArtifacts`                 | Custom delivery only. Map of area name → locale list (for example `"eu": ["en", "it", "fr"]`).                                                   |
