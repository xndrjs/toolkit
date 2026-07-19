---
title: External validation
description: Validate CMS and API translation payloads against the generated dictionary schema.
---

Codegen always writes `dictionary-schema.generated.ts` under `codegenPath/`. Use it to validate `unknown` CMS/API payloads against the ICU contract before updating authoring files and calling `regenerateNamespaces`.

```ts
import { formatIssues } from "@xndrjs/i18n/validation";
import { validateExternalKey } from "./i18n/generated/dictionary-schema.generated.js";

const raw: unknown = await loadTranslations();
const result = validateExternalKey("billing", "invoice_summary", raw);

if (!result.ok) {
  console.error(formatIssues(result.issues));
  return;
}

// merge into delivery artifacts / CMS write path
```

Codegen emits `validateExternalDictionaryPartial()`, `validateExternalNamespacePartial()`, and `validateExternalKey()`.

Validation runs in two phases:

1. **Normalize** — parse ICU templates, extract variables, check required keys (missing keys fail; extra keys ignored; partial locales OK).
2. **Validate** — compare extracted arguments against the static `Params` schema via Zod.

Low-level helpers are also exported from `@xndrjs/i18n/validation` for custom wiring. See [Errors & exports](/v0/infrastructure/i18n/errors-and-exports/).
