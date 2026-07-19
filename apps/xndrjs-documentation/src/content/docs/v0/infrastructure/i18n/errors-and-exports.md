---
title: Errors & exports
description: Runtime error prefixes and public @xndrjs/i18n exports.
---

## Error semantics

| Condition                              | Error prefix / message                                 |
| -------------------------------------- | ------------------------------------------------------ |
| Missing key or locale (after fallback) | `[i18n] Missing key or locale: ...`                    |
| Empty `load({ namespaces })`           | `[i18n] load() requires a non-empty namespaces array.` |
| Missing delivery artifact              | `[i18n] No translation artifact for namespace ...`     |
| Malformed ICU in dictionary            | `[i18n ICU Syntax Error] ...`                          |
| Missing or invalid format params       | `[i18n Formatting Error] ...`                          |
| Circular locale fallback               | `[i18n] Circular locale fallback detected ...`         |

There is no runtime `scope.set()` / patch API — editorial updates go through authoring files + [`regenerateNamespaces`](/v0/infrastructure/i18n/codegen/#full-codegen-vs-content-only-refresh).

## Public exports

From `@xndrjs/i18n`:

```ts
import {
  IcuTranslationProviderMulti,
  formatLocaleFallbackChain,
  resolveLocaleTemplate,
  validateLocaleFallback,
} from "@xndrjs/i18n";
```

From `@xndrjs/i18n/codegen`:

```ts
import { runCodegen, regenerateNamespaces } from "@xndrjs/i18n/codegen";
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

React primitives (`I18nRootProvider`, `createI18nLoadGate`, …) are exported from `@xndrjs/i18n-react`; apps normally import the generated bindings instead. See [React](/v0/infrastructure/i18n/react/).
