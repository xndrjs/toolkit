---
"@xndrjs/contentful-to-zod": minor
---

Rename field-localization config and generated exports for clarity (breaking):

- Config: `locale.modes: ("flat" | "localized-only" | "all")[]` replaces `locale.mode` (`cma`/`delivery`/`both`) and `localeStar`.
- Default modes: `["flat", "localized-only"]` (former `both`).
- Exports: `*DeliveryFields*` → `*LocalizedFields*`, `*Entry*` → `*LocalizedEntry*`, flatten helpers → `flatten*LocalizedFields`.
- Registry: `ContentfulLocalizedEntrySchemaByContentType`, `ContentfulResolvedLocalizedEntrySchema`.
- Asset fields: `ContentfulAssetFieldsSchema`.
- Emit `ContentfulEntryEnvelopeSchema` as a structural entry gate.
- Locale/content-type id constants remain values-first `as const` arrays.
