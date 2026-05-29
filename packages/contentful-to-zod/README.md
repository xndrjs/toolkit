# @xndrjs/contentful-to-zod

Generate **Zod 4** schemas from Contentful content types (CMA). Stop hand-writing codegen and get precise `z.infer` types where graphql-codegen stays on `string`.

This package outputs **Zod schemas and optional locale helpers only** — no `domain.shape` in the generated file. If you use [xndrjs](https://github.com/xndrjs/toolkit), wire schemas with `zodToValidator` from [`@xndrjs/domain-zod`](../domain-zod) in your own code.

## Principles

- **1:1 mapping** from the CMA content model to Zod (field type + `validations` + `required`).
- **Two schema shapes** (configurable): **flat / CMA** (single value per field) and **delivery** (`localized: true` → `z.record(ContentfulLocaleCodeSchema, T)`).
- **Default `locale.mode: "both"`** — each content type exports flat + delivery field schemas (e.g. `BlogPostFieldSchema` + `BlogPostDeliveryFieldsSchema`) plus entry wrappers and `flatten*` helpers when both are emitted.
- **Locales from your space** — enum and constants are generated from a CMA `/locales` snapshot; `CONTENTFUL_DEFAULT_LOCALE` is only the default parameter for helpers (no runtime rule that the default locale must exist in every record).
- **Self-contained output** — generated file depends only on `zod`; shared primitives (entry/asset links, location, …) are inlined once at the top.
- **Optional Object overrides** — CMA declares `Object` without inner shape; supply Zod schemas via config for `{contentTypeId}.{fieldId}` keys.

## Install

```bash
pnpm add @xndrjs/contentful-to-zod zod@^4
```

## CLI

```bash
contentful-to-zod \
  --space-id $SPACE \
  --environment master \
  --management-token $TOKEN \
  --out ./src/generated/contentful.schemas.ts \
  --snapshot ./src/generated/content-types.json \
  --snapshot-locales ./src/generated/locales.json
```

Offline / CI (no CMA calls):

```bash
contentful-to-zod \
  --from-snapshot \
  --snapshot ./src/generated/content-types.json \
  --snapshot-locales ./src/generated/locales.json \
  --out ./src/generated/contentful.schemas.ts
```

Other flags: `--content-types blogPost,author`, `--config ./contentful-to-zod.config.ts`, `--dry-run` (print to stdout).

Environment fallbacks: `CONTENTFUL_MANAGEMENT_TOKEN`, `CONTENTFUL_SPACE_ID`, `CONTENTFUL_ENVIRONMENT`.

`--snapshot-locales` is required when using `--from-snapshot` and locale mode is `delivery` or `both` (the default).

## Programmatic API

```ts
import { fetchContentTypes, fetchLocales, generateZodSchemas } from "@xndrjs/contentful-to-zod";
import { writeFile } from "node:fs/promises";

const cma = { spaceId, accessToken, environmentId: "master" };

const [contentTypes, locales] = await Promise.all([fetchContentTypes(cma), fetchLocales(cma)]);

const source = generateZodSchemas(contentTypes, {
  locales,
  config: { locale: { mode: "both" } },
});

await writeFile("./src/generated/contentful.schemas.ts", source, "utf8");
```

`generateZodSchemas` options: `contentTypeIds`, `locales` (required when mode is `delivery` or `both`), `localeMode`, `config`.

## Locale mode

In `contentful-to-zod.config.ts` (or `generateZodSchemas` options):

```ts
import { defineConfig } from "@xndrjs/contentful-to-zod";

export default defineConfig({
  locale: {
    /** Default: "both" */
    mode: "both", // "cma" | "delivery" | "both"
  },
});
```

| `locale.mode`      | Generated exports                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `"cma"`            | Flat field schemas only (`BlogPostFieldSchema`, `BlogPostFields`)                          |
| `"delivery"`       | Delivery field schemas + entry wrappers + `pickLocale` + locale enum/constants             |
| `"both"` (default) | Flat + delivery field schemas + entry wrappers + `pickLocale` + `flatten{Type}EntryFields` |

Rules:

- **Flat field schemas** (`*FieldSchema`) wrap every field in **`flatField()`** — same `undefined`/`null` normalization as delivery, for use after `flatten*EntryFields` (or direct parse of a flat shape).
- **Delivery field schemas** (`*DeliveryFieldsSchema`, `*EntrySchema`) wrap every field in **`transportField()`**. CMA `required` does not apply at the transport boundary.
- **`localized: true`** — flat uses `flatField(T)`; delivery uses `transportField(z.record(ContentfulLocaleCodeSchema, T))`.
- **`disabled` / `omitted`** fields are still included (full blueprint).

### Generated locale primitives

When delivery or both mode is active, the file starts with:

```ts
/** @generated from space locales snapshot */
export const ContentfulLocaleCodeSchema = z.enum(["en-US", "it-IT"]);
export type ContentfulLocaleCode = z.infer<typeof ContentfulLocaleCodeSchema>;

export const CONTENTFUL_LOCALE_CODES = ContentfulLocaleCodeSchema.options;
export const CONTENTFUL_DEFAULT_LOCALE = "en-US" as const;

/**
 * Flat/CMA field wrapper: omitted keys and explicit null both normalize to `null`.
 */
export function flatField<T extends z.ZodType>(schema: T) {
  return schema
    .nullable()
    .optional()
    .transform((value) => value ?? null);
}

/**
 * Delivery/Preview field wrapper: omitted keys and explicit null both normalize to `null`.
 * CMA `required` does not apply at the transport boundary.
 */
export function transportField<T extends z.ZodType>(schema: T) {
  return schema
    .nullable()
    .optional()
    .transform((value) => value ?? null);
}
```

### Flat vs delivery example

```ts
// flat / CMA — flatField normalizes absent values to null
export const BlogPostFieldSchema = z.object({
  title: flatField(z.string().max(256)),
  slug: flatField(z.string()),
  author: flatField(ContentfulEntryLinkSchema),
});

export type BlogPostFields = z.infer<typeof BlogPostFieldSchema>;

// delivery — REST/Preview (transportField per field)
export const BlogPostDeliveryFieldsSchema = z.object({
  title: transportField(z.record(ContentfulLocaleCodeSchema, z.string().max(256))),
  slug: transportField(z.string()),
  author: transportField(ContentfulEntryLinkSchema),
});

export type BlogPostDeliveryFields = z.infer<typeof BlogPostDeliveryFieldsSchema>;

// full entry — parse raw Delivery/Preview responses at the API boundary
export const BlogPostEntrySchema = z.object({
  sys: ContentfulEntrySysSchema.extend({
    contentType: z.object({
      sys: z.object({
        type: z.literal("Link"),
        linkType: z.literal("ContentType"),
        id: z.literal("blogPost"),
      }),
    }),
  }),
  fields: BlogPostDeliveryFieldsSchema,
});

export type BlogPostEntry = z.infer<typeof BlogPostEntrySchema>;
```

## Generated helpers

Helpers are pure functions in the same output file. They **do not validate** — parse after flattening:

```ts
import {
  BlogPostEntrySchema,
  BlogPostFieldSchema,
  flattenBlogPostEntryFields,
  pickLocale,
} from "./generated/contentful.schemas";

const entry = BlogPostEntrySchema.parse(rawFromContentful);
const flat = flattenBlogPostEntryFields(entry.fields, "it-IT");
const post = BlogPostFieldSchema.parse(flat);
```

- **`pickLocale`** — read one locale from a localized delivery field (`Record<ContentfulLocaleCode, T> | null`); missing locale or `null` input → `null`. Default locale parameter is `CONTENTFUL_DEFAULT_LOCALE`.
- **`flatten{ContentType}EntryFields`** — map validated `entry.fields` (`*DeliveryFields`) → flat `*Fields` for one locale (one per content type when `mode` is `both`). Coalesces absent values to `null` (`?? null` on every field; localized fields via `pickLocale`).

There is no runtime dependency on `@xndrjs/contentful-to-zod` in production — only the generated file and `zod`.

## Object field overrides

```ts
// contentful-to-zod.config.ts
import { z } from "zod";
import { defineConfig } from "@xndrjs/contentful-to-zod";

export default defineConfig({
  objects: {
    "blogPost.metadata": z.object({
      seoTitle: z.string(),
      noIndex: z.boolean().optional(),
    }),
  },
});
```

Overrides apply to the **base field type** `T`. In delivery mode, localized fields wrap `transportField(z.record(ContentfulLocaleCodeSchema, T))` around that base.

Overrides are inlined at codegen time — the config is not imported at runtime.

## Mapping Delivery / REST data

1. Parse raw responses with `*EntrySchema` (or type `fields` as `*DeliveryFields` when you only have the fields object).
2. Validate the flat shape with `*FieldSchema.parse(...)` after `flatten*EntryFields`.

Entry/asset link objects and CMA validations (size, range, regex, etc.) are reflected in the generated Zod chains.

## xndrjs recipe (optional)

Wire flat field schemas and the locale enum into `@xndrjs/domain-zod`:

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { BlogPostFieldSchema, ContentfulLocaleCodeSchema } from "./generated/contentful.schemas";

export const BlogPost = domain.shape("BlogPost", zodToValidator(BlogPostFieldSchema));

export const SupportedLocale = domain.primitive(
  "SupportedLocale",
  zodToValidator(ContentfulLocaleCodeSchema)
);
```

Use `SupportedLocale` (or your own name) wherever application code should accept only locales known to the space snapshot.

## CMA field mapping (summary)

| CMA `type`   | Zod base                                               |
| ------------ | ------------------------------------------------------ |
| Symbol, Text | `z.string()` + validations                             |
| Integer      | `z.number().int()`                                     |
| Number       | `z.number()`                                           |
| Boolean      | `z.boolean()`                                          |
| Date         | `z.string()` / `z.iso.datetime()`                      |
| Location     | `z.object({ lat, lon })`                               |
| Object       | `z.record(z.string(), z.unknown())` or config override |
| Link         | Contentful link object                                 |
| Array        | `z.array(itemSchema)`                                  |
| Rich Text    | `z.looseObject({ nodeType: z.literal("document") })`   |
