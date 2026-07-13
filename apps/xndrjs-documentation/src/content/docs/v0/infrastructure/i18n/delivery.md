---
title: Delivery
description: Canonical, split-by-locale, and custom delivery areas for i18n codegen artifacts.
---

`delivery` in `i18n.codegen.json` controls how codegen materializes dictionary JSON under `{deliveryOutput}/translations/` (default `generated/translations/`):

| Value                   | Behavior                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"canonical"` (default) | One multilocale JSON per namespace — source `.json` in place, or YAML compiled to `{basename}.json`. Exports `defaultDictionary`. Lazy loaders: `namespaceLoaders.billing()`.                                              |
| `"split-by-locale"`     | One JSON per namespace **and locale**: `{basename}.{locale}.json`. Lazy loaders: `namespaceLoaders.billing(locale)`. `createI18n({})` returns a builder — `await builder.withNamespaces([...]).withLocale(locale).load()`. |
| `"custom"`              | One JSON per namespace **and delivery area** (for example `billing.eu.json`). Load via `withDeliveryArea(area).load()`. Codegen emits `DELIVERY_ARTIFACTS` and narrows `ActiveLocales` per area.                           |

Authoring stays on the canonical source files. See [Type-safe i18n and flexible delivery](/blog/type-safe-i18n-with-flexible-delivery/) for how authoring, compiler, delivery, and runtime stay separated. `MyProjectSchema` is generated explicitly (`Partial<Record<MyProjectLocale, string>>` per key from ICU analysis) — not from `typeof import` of JSON/YAML files. Audit still reads the config paths.

Each split file uses the same projection as `projectDictionaryLocales(dict, [locale])` (including `localeFallback` resolution at codegen time):

```json
{
  "profile_title": { "it": "Il tuo profilo" },
  "greeting": { "it": "Ciao {name}!" }
}
```

## Split-by-locale example

```json
{
  "delivery": "split-by-locale",
  "namespaces": {
    "default": "translations/default.json",
    "billing": "translations/billing.yaml"
  },
  "namespaceLoadersOutput": "generated/namespace-loaders.generated.ts",
  "localeFallback": {
    "en": null,
    "de-CH": "en"
  }
}
```

Generated init and lazy loading:

```ts
import { createI18n } from "./i18n/generated/instance.generated.js";

const activeLocale = "it" as const;

const scope = await createI18n({})
  .withNamespaces(["default", "billing"])
  .withLocale(activeLocale)
  .load();

scope.t("billing", "invoice_summary", { count: 3 });
```

Pass the shared engine via one `createI18n({})` per app — each builder instance shares the same engine when wired through the generated factory. Loading a **different** locale or delivery area adds translations for that partition. Reloading the **same** namespace + partition is skipped so runtime `scope.set()` patches are preserved. Load a subset when a route needs fewer namespaces: `.withNamespaces(["billing"])`.

`createI18n({})` returns a builder in split/custom lazy mode. Runtime `projectDictionaryLocales` / `projectNamespaceLocales` remain useful for external CMS/API payloads that still arrive as multilocale dictionaries. See [Lazy loading](/v0/infrastructure/i18n/lazy-loading/) and [Runtime](/v0/infrastructure/i18n/runtime/).

## Custom delivery areas

With `"delivery": "custom"`, declare named areas in `deliveryArtifacts` (for example `eu`, `amer`). Codegen emits area-scoped JSON and typed loaders. After `withDeliveryArea("eu").load()`, unbound scopes expose `forLocale()` only for locales in `DELIVERY_ARTIFACTS.eu` at compile time.
