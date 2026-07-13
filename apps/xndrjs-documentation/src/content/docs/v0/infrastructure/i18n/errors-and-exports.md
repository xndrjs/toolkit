---
title: Errors & exports
description: Runtime error prefixes and public @xndrjs/i18n exports.
---

## Error semantics

| Condition                              | Error prefix / message                         |
| -------------------------------------- | ---------------------------------------------- |
| Missing key or locale (after fallback) | `[i18n] Missing key or locale: ...`            |
| Key not preloaded for `scope.set()`    | `[i18n] Key not preloaded: ...`                |
| ICU syntax error on patch              | `[i18n] ICU syntax error on patch: ...`        |
| ICU args mismatch on patch             | `[i18n] ICU args mismatch on patch: ...`       |
| Malformed ICU in dictionary            | `[i18n ICU Syntax Error] ...`                  |
| Missing or invalid format params       | `[i18n Formatting Error] ...`                  |
| Circular locale fallback               | `[i18n] Circular locale fallback detected ...` |

## Public exports

From `@xndrjs/i18n`:

```ts
import {
  IcuTranslationProviderSingle,
  IcuTranslationProviderMulti,
  formatLocaleFallbackChain,
  resolveLocaleTemplate,
  validateLocaleFallback,
} from "@xndrjs/i18n";
```

From `@xndrjs/i18n/validation` (low-level; generated helpers wrap `DICTIONARY_SPEC` for you):

```ts
import {
  formatIssues,
  normalizeDictionary,
  parseTemplate,
  validateExternalDictionary,
  validateExternalNamespace,
} from "@xndrjs/i18n/validation";
```

When using the generated `dictionary-schema.generated.ts`, prefer `validateExternalDictionary(raw)` — it binds `DICTIONARY_SPEC` automatically.
