---
"@xndrjs/i18n": patch
---

Validate `i18n.codegen.json` with a strict Zod schema in `loadConfig` (codegen and audit). Unknown keys and invalid values fail with a formatted issue report; allowed keys are derived from the schema shape so the list cannot drift from validation rules.

`zod` is now a **required** peer dependency (no longer optional): install it alongside `tsx` for codegen and audit.
