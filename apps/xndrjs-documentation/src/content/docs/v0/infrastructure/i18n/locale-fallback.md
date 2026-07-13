---
title: Locale fallback
description: Fallback chains, regional locales, and locale projection helpers.
---

When a template is **missing** for the requested locale (`undefined` in the dictionary), the provider walks a configured fallback chain before throwing. An empty string `""` is a **valid template** and does **not** trigger fallback.

```json
"localeFallback": {
  "en": null,
  "de-DE": "en",
  "de-CH": "de-DE",
  "it": "en"
}
```

- `null` — terminal locale (stop walking).
- Any other value — next locale to try, recursively.
- Cycles are rejected at provider construction and during resolution.

Codegen emits `LOCALE_FALLBACK` and extends the locale union. The generated `createI18n(dictionary)` wires the map automatically.

Partial regional locales (for example `en-US` overriding only a subset of keys, falling back to `en`) are a common use case — you do not need to duplicate the full dictionary for every variant.

## `projectDictionaryLocales`

The generated helper has this signature in multi-namespace mode:

```ts
function projectDictionaryLocales(
  dictionary: MyProjectSchema,
  locales: readonly MyProjectLocale[]
): MyProjectSchema;
```

Inputs:

- `dictionary` — the complete generated dictionary schema.
- `locales` — the locales to retain. Duplicate locale values are ignored.

For each namespace and key, the output contains only the requested locales. A direct template is copied when present; otherwise the generated `LOCALE_FALLBACK` chain is resolved using the same rules as `t()`. A key is omitted when none of the requested locales can resolve a template. The input dictionary is not mutated.

```ts
const input: MyProjectSchema = {
  default: {
    welcome: {
      en: "Welcome",
      "de-DE": "Willkommen",
    },
    checkout: {
      en: "Checkout",
    },
  },
};

const output = projectDictionaryLocales(input, ["de-CH"]);
```

Given `de-CH → de-DE → en`, the expected output is:

```ts
{
  default: {
    welcome: {
      "de-CH": "Willkommen",
    },
    checkout: {
      "de-CH": "Checkout",
    },
  },
}
```

## `projectNamespaceLocales`

Multi-namespace mode also emits a namespace-scoped variant. Codegen overloads the first argument per namespace so the return type matches the input namespace:

```ts
function projectNamespaceLocales(
  dictionary: MyProjectSchema["default"],
  locales: readonly MyProjectLocale[]
): MyProjectSchema["default"];
function projectNamespaceLocales(
  dictionary: MyProjectSchema["billing"],
  locales: readonly MyProjectLocale[]
): MyProjectSchema["billing"];
// ...one overload per namespace
```

Inputs:

- `dictionary` — one namespace dictionary from the generated schema.
- `locales` — the locales to retain. Duplicate locale values are ignored.

For each key, the output contains only the requested locales. Fallback resolution, key omission, and non-mutation rules are the same as `projectDictionaryLocales`, applied to a single namespace instead of the full schema.

```ts
const input: MyProjectSchema["billing"] = {
  invoice_title: {
    en: "Invoice",
    "de-DE": "Rechnung",
  },
  payment_due: {
    en: "Payment due",
  },
};

const output = projectNamespaceLocales(input, ["de-CH"]);
```

Given `de-CH → de-DE → en`, the expected output is:

```ts
{
  invoice_title: {
    "de-CH": "Rechnung",
  },
  payment_due: {
    "de-CH": "Payment due",
  },
}
```

Use `xndrjs-i18n-audit` to measure coverage: `missingDirectByLocale` lists keys without a template for that locale (translator backlog); `missingEffectiveByLocale` lists keys that would still fail at runtime after walking the fallback chain. See [Overview — Audit script](/v0/infrastructure/i18n/#audit-script).

If the chain exhausts without a template, `t()` throws and includes the full chain:

```text
[i18n] Missing key or locale: "welcome" [de-CH] (fallback chain: de-CH → de-DE → en)
```
