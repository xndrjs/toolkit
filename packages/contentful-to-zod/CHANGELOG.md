# @xndrjs/contentful-to-zod

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
