---
title: Delivery
description: Split-by-locale and custom delivery areas for i18n codegen artifacts.
---

`delivery` in `i18n.codegen.json` controls how codegen materializes dictionary JSON under `{artifactsPath}/translations/` (default `{codegenPath}/translations/`):

| Value               | Behavior                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `"split-by-locale"` | One JSON per namespace **and locale**: `{basename}.{locale}.json`. Loaders: `namespaceLoaders.billing(locale)`.                   |
| `"custom"`          | One JSON per namespace **and delivery area** (for example `billing.eu.json`). Locale → area via generated `LOCALE_DELIVERY_AREA`. |

Authoring stays on the canonical source files. `MyProjectSchema` is generated from ICU analysis (`Partial<Record<MyProjectLocale, string>>` per key) — not from `typeof import` of JSON/YAML files.

Each split file uses the same projection as codegen’s locale/area split (including `localeFallback` resolution at codegen time):

```json
{
  "profile_title": { "it": "Il tuo profilo" },
  "greeting": { "it": "Ciao {name}!" }
}
```

## Split-by-locale example

```json
{
  "projectName": "MyProject",
  "delivery": "split-by-locale",
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml"
  },
  "codegenPath": "generated",
  "localeFallback": {
    "en": null,
    "de-CH": "en"
  }
}
```

```ts
import { createI18n } from "./i18n/generated/instance.generated.js";

const { t } = await createI18n().load({
  namespaces: ["default", "billing"],
  locale: "it",
});
t("billing", "invoice_summary", { count: 3 });
```

## Custom areas

```json
{
  "projectName": "MyProject",
  "delivery": "custom",
  "deliveryArtifacts": {
    "eu": ["en", "it", "fr"],
    "amer": ["en-US", "es-AR"]
  },
  "namespaces": {
    "billing": "translations/billing.json"
  },
  "codegenPath": "generated"
}
```

See [Configuration](/v0/infrastructure/i18n/configuration/) for the full field list.
