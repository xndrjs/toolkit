# @xndrjs/contentful-to-zod

## 0.4.0-alpha.0

### Minor Changes

- b510fc7: Field-localization overhaul, named field enums, and `locale=*` (LocaleStar) shapes.

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

## 0.3.1

### Patch Changes

- bcd8b50: Additive codegen exports for typed content-type dispatch and link discovery:
  - Emit `ContentfulContentTypeId` (+ entry schema maps in delivery modes).
  - Emit `LINK_FIELDS_BY_CONTENT_TYPE` metadata (Entry/Asset link fields per content type from CMA).

## 0.3.1-alpha.0

### Patch Changes

- bcd8b50: Additive codegen exports for typed content-type dispatch and link discovery:
  - Emit `ContentfulContentTypeId` (+ entry schema maps in delivery modes).
  - Emit `LINK_FIELDS_BY_CONTENT_TYPE` metadata (Entry/Asset link fields per content type from CMA).

## 0.3.0

### Minor Changes

- 917b3b9: Improved config loading and options

## 0.2.1

### Patch Changes

- Narrow resolved entry links using CMA linkContentType: parseEntryAsLinkField validates and types fetched entries; getAllowedEntryLinkContentTypes exposes the allowed target content types per parent field.

## 0.2.0

### Minor Changes

- Config-first CLI: load `contentful-to-zod.config.ts` with jiti, merge CLI args over config (with warnings), and drop hardcoded Contentful env fallbacks. Rename generated flat field schemas from `*FieldSchema` to `*FieldsSchema` for consistency with `*DeliveryFieldsSchema`.
- 917b3b9: Improved config loading and options

## 0.1.2

### Patch Changes

- omitted, disabled and deleted fields handling

## 0.1.1

### Patch Changes

- c583fbf: fix: null normalization

## 0.1.1-alpha.0

### Patch Changes

- c583fbf: fix: null normalization

## 0.1.0

### Minor Changes

- 164661c: Initial release: generate Zod 4 schemas from Contentful content types with flat/CMA and delivery locale modes, generated locale helpers, CLI, and CMA fetch.
- 33bd02f: whole entry schema in zod schema generation

## 0.1.0-alpha.1

### Minor Changes

- 33bd02f: whole entry schema in zod schema generation

## 0.1.0-alpha.0

### Minor Changes

- 164661c: Initial release: generate Zod 4 schemas from Contentful content types with flat/CMA and delivery locale modes, generated locale helpers, CLI, and CMA fetch.
