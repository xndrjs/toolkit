---
"@xndrjs/contentful-to-zod": patch
---

Emit `CONTENTFUL_LOCALE_CODES` and `CONTENTFUL_CONTENT_TYPE_IDS` as values-first `as const` arrays; types and `z.enum(...)` schemas are derived from those arrays (no longer `Schema.options`).

Emit `ContentfulEntryEnvelopeSchema` (`sys` + untyped `fields`) as a structural Delivery/Preview entry gate before content-type-specific parse.
