---
title: External validation
description: Validate CMS and API translation payloads before scope.set().
---

When translations arrive from a CMS or API, validate `unknown` input before `scope.set()`. Keys must be preloaded via `load()` first.

```json
{
  "dictionarySchemaOutput": "generated/dictionary-schema.generated.ts"
}
```

Codegen emits `validateExternalDictionary()`, `validateExternalDictionaryPartial()`, `validateExternalNamespacePartial()`, and `validateExternalKey()`:

```ts
import { formatIssues } from "@xndrjs/i18n/validation";
import { validateExternalKey } from "./i18n/generated/dictionary-schema.generated.js";
import { createI18n } from "./i18n";

const { set } = await createI18n({}).withNamespaces(["billing"]).withLocale("it").load();

const raw: unknown = await loadTranslations();
const result = validateExternalKey("billing", "invoice_summary", raw);

if (!result.ok) {
  console.error(formatIssues(result.issues));
  return;
}

set("billing", "invoice_summary", result.data.invoice_summary.it!);
```

Validation runs in two phases:

1. **Normalize** — parse ICU templates, extract variables, check required keys (missing keys fail; extra keys ignored; partial locales OK).
2. **Validate** — compare extracted arguments against the static `Params` schema via Zod.

Low-level helpers are also exported from `@xndrjs/i18n/validation` for custom wiring. See [Errors & exports](/v0/infrastructure/i18n/errors-and-exports/).
