---
title: Locale fallback
description: Fallback chains and regional locales for missing templates.
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

Codegen emits `LOCALE_FALLBACK` and extends the locale union. The generated `createI18n()` factory wires the map into the engine automatically.

Partial regional locales (for example `en-US` overriding only a subset of keys, falling back to `en`) are a common use case — you do not need to duplicate the full dictionary for every variant.

With `delivery: "split-by-locale"` or `custom`, codegen applies the same fallback rules when writing delivery JSON, so each artifact already contains the strings the runtime would resolve for that locale or area.

Use `xndrjs-i18n-audit` to measure coverage: `missingDirectByLocale` lists keys without a template for that locale (translator backlog); `missingEffectiveByLocale` lists keys that would still fail at runtime after walking the fallback chain. See [Overview — Audit script](/v0/infrastructure/i18n/#audit-script).

If the chain exhausts without a template, `t()` throws and includes the full chain:

```text
[i18n] Missing key or locale: "welcome" [de-CH] (fallback chain: de-CH → de-DE → en)
```
