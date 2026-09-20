---
"@xndrjs/contentful-to-zod": minor
---

Field-localization overhaul, named field enums, and `locale=*` (LocaleStar) shapes.

**Breaking (config / exports)**

- Config: `locale.modes: ("flat" | "localized-only" | "all")[]` replaces `locale.mode` (`cma`/`delivery`/`both`) and `localeStar`.
- Default modes: `["flat", "localized-only"]` (former `both`).
- Exports: `*DeliveryFields*` → `*LocalizedFields*`, `*Entry*` → `*LocalizedEntry*`, flatten helpers → `flatten*LocalizedFields`.
- Registry: `ContentfulLocalizedEntrySchemaByContentType`, `ContentfulResolvedLocalizedEntrySchema`.
- Asset fields: `ContentfulAssetFieldsSchema`.
- Locale / content-type id constants are values-first `as const` arrays (no longer `Schema.options`).

**Additive**

- Emit `ContentfulEntryEnvelopeSchema` as a structural entry gate.
- Named field enums from `validations.in` (values-first const + schema; referenced in flat / localized-only / locale-star shapes).
- Mode `"all"`: `*LocaleStarFieldsSchema`, `*LocaleStarEntrySchema`, and locale-star entry maps.
- When `flat` + `all`: `flatten*LocaleStarEntryFields` with default-locale fallback for non-localized fields under `locale=*`.
