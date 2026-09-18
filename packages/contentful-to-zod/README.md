# @xndrjs/contentful-to-zod

Generate **Zod 4** schemas from Contentful content types (CMA). Stop hand-writing codegen and get precise `z.infer` types where graphql-codegen stays on `string`.

This package outputs **Zod schemas and optional locale helpers only** — no `domain.shape` in the generated file. If you use [xndrjs](https://github.com/xndrjs/toolkit), wire schemas with `zodToValidator` from [`@xndrjs/domain-zod`](../domain-zod) in your own code.

## Principles

- **Transport-aware mapping** from the CMA content model to Zod (field type + validations; absent/null transport values normalize to `null`).
- **Field localization modes** (multi-select in one file): **`flat`** (single-locale values), **`localized-only`** (maps on `localized: true` fields), **`all`** (`locale=*`, every field a locale map).
- **Default `locale.modes: ["flat", "localized-only"]`** — flat + localized-only field schemas, localized entry schemas, and `flatten*LocalizedFields` helpers.
- **Locales from your space** — enum and constants are generated from a CMA `/locales` snapshot; `CONTENTFUL_DEFAULT_LOCALE` is only the default parameter for helpers (no runtime rule that the default locale must exist in every record).
- **Self-contained output** — generated file depends only on `zod`; shared primitives (entry/asset links, location, …) are inlined once at the top.
- **Optional Object overrides** — CMA declares `Object` without inner shape; supply Zod schemas via config for `{contentTypeId}.{fieldId}` keys.

## Install

```bash
pnpm add zod@^4
pnpm add -D @xndrjs/contentful-to-zod @dotenvx/dotenvx
```

## CLI

Because `@xndrjs/contentful-to-zod` is a codegen dependency, keep the codegen options in `contentful-to-zod.config.ts` and run the local CLI through your package manager:

```ts
import { defineConfig } from "@xndrjs/contentful-to-zod";

export default defineConfig({
  cma: {
    spaceId: process.env.CONTENTFUL_BLOG_SPACE_ID,
    managementToken: process.env.CONTENTFUL_BLOG_MANAGEMENT_TOKEN,
    environment: process.env.CONTENTFUL_BLOG_ENVIRONMENT ?? "master",
  },
  out: "./src/generated/contentful.schemas.ts",
  snapshot: "./src/generated/content-types.json",
  snapshotLocales: "./src/generated/locales.json",
});
```

```json
{
  "scripts": {
    "contentful:schema": "dotenvx run -- contentful-to-zod --config ./contentful-to-zod.config.ts"
  }
}
```

Live fetch from CMA (writes snapshots for reproducible CI):

```bash
pnpm run contentful:schema
```

For a one-off run, you can also use `npx`:

```bash
npx @xndrjs/contentful-to-zod \
  --space-id "your_space_id" \
  --management-token "your_management_token" \
  --environment master \
  --out ./src/generated/contentful.schemas.ts \
  --snapshot ./src/generated/content-types.json \
  --snapshot-locales ./src/generated/locales.json
```

Other flags: `--content-types blogPost,author`, `--config ./contentful-to-zod.config.ts`, `--dry-run` (print to stdout).
If an option is set in both CLI args and config, the CLI arg wins and `contentful-to-zod` prints a warning.

## Programmatic API

```ts
import { fetchContentTypes, fetchLocales, generateZodSchemas } from "@xndrjs/contentful-to-zod";
import { writeFile } from "node:fs/promises";

const cma = { spaceId, accessToken, environmentId: "master" };

const [contentTypes, locales] = await Promise.all([fetchContentTypes(cma), fetchLocales(cma)]);

const source = generateZodSchemas(contentTypes, {
  locales,
  config: { locale: { modes: ["flat", "localized-only"] } },
});

await writeFile("./src/generated/contentful.schemas.ts", source, "utf8");
```

`generateZodSchemas` options: `contentTypeIds`, `locales` (required when modes include `localized-only` or `all`), `localeModes`, `config`.

## Field localization modes

In `contentful-to-zod.config.ts` (or `generateZodSchemas` options):

```ts
import { defineConfig } from "@xndrjs/contentful-to-zod";

export default defineConfig({
  locale: {
    /** Default: ["flat", "localized-only"] — multiple shapes in one file */
    modes: ["flat", "localized-only"], // also "all" for locale=*
  },
});
```

Want separate files per mode? Run codegen twice with different `out` / `modes` (as in `@xndrjs/contentful-to-zod-demo`).

Fields marked `disabled`, `omitted`, or `deleted` in the CMA blueprint are **excluded** from generated schemas and flatten helpers unless you opt in:

```ts
export default defineConfig({
  fields: {
    includeOmitted: true,
    includeDisabled: true,
    includeDeleted: true,
  },
});
```

| `locale.modes` includes                 | Generated exports                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `"flat"`                                | Flat `*FieldsSchema`                                                                      |
| `"localized-only"`                      | `*LocalizedFieldsSchema`, `*LocalizedEntrySchema`, entry maps, `pickLocale`, link helpers |
| `"flat"` + `"localized-only"` (default) | Above + `flatten*LocalizedFields`                                                         |
| `"all"`                                 | `*LocaleStar*` shapes for `locale=*` (emission follow-up; flag accepted now)              |

Rules:

- **`flat`** (`*FieldsSchema`) — one value per field; wrap with **`flatField()`**. Use for CDA `locale=<code>` or after flatten.
- **`localized-only`** (`*LocalizedFieldsSchema`, `*LocalizedEntrySchema`) — wrap with **`transportField()`**; only `localized: true` fields become `z.record(ContentfulLocaleCodeSchema, T)`.
- **`disabled` / `omitted` / `deleted`** fields are excluded by default. Opt in via config: `fields.includeDisabled`, `fields.includeOmitted`, `fields.includeDeleted`.

### Generated locale primitives

When `localized-only` or `all` is active, the file starts with:

```ts
/** @generated from space locales snapshot */
export const CONTENTFUL_LOCALE_CODES = ["en-US", "it-IT"] as const;
export type ContentfulLocaleCode = (typeof CONTENTFUL_LOCALE_CODES)[number];
export const ContentfulLocaleCodeSchema = z.enum(CONTENTFUL_LOCALE_CODES);
export const CONTENTFUL_DEFAULT_LOCALE = "en-US" as const;
```

Locale (and content-type id) constants are **values-first**: the `as const` array is the source of truth, then the type and `z.enum(...)` are derived from it. This is a minor breaking change if you relied on `CONTENTFUL_LOCALE_CODES = Schema.options` (runtime values remain equivalent).

### Generated content-type id registry

After per-type schemas, codegen emits a closed set of content type ids (and, in delivery/`both`, typed entry maps):

```ts
/** @generated from content type snapshot */
export const CONTENTFUL_CONTENT_TYPE_IDS = ["author", "blogPost"] as const;
export type ContentfulContentTypeId = (typeof CONTENTFUL_CONTENT_TYPE_IDS)[number];
export const ContentfulContentTypeIdSchema = z.enum(CONTENTFUL_CONTENT_TYPE_IDS);

export type ContentfulLocalizedEntryByContentType = {
  author: AuthorLocalizedEntry;
  blogPost: BlogPostLocalizedEntry;
};

export const ContentfulLocalizedEntrySchemaByContentType = {
  author: AuthorLocalizedEntrySchema,
  blogPost: BlogPostLocalizedEntrySchema,
} as const satisfies {
  [K in ContentfulContentTypeId]: z.ZodType<ContentfulLocalizedEntryByContentType[K]>;
};
```

Use these to type dispatch tables (e.g. expansion policies) so adding a content type to the CMA snapshot fails typecheck until every branch is updated.

In delivery/`both` mode, codegen also emits a structural gate before CT-specific parse:

```ts
/** Structural Delivery/Preview entry envelope (any content type); fields are untyped. */
export const ContentfulEntryEnvelopeSchema = z.object({
  sys: ContentfulEntrySysSchema,
  fields: z.record(z.string(), z.unknown()),
});
```

Use it to accept mixed entry arrays (`includes.Entry`, batch loads), then dispatch with `sys.contentType.sys.id` into `ContentfulLocalizedEntrySchemaByContentType`. It is **not** the same as `ContentfulResolvedLocalizedEntrySchema` (closed union of known typed entries).

### Flat vs delivery example

```ts
// flat / CMA — single value per field, normalized by flatField()
export const BlogPostFieldsSchema = z.object({
  title: flatField(z.string().max(256)),
  slug: flatField(z.string()),
  author: flatField(ContentfulEntryLinkSchema),
});

export type BlogPostFields = z.infer<typeof BlogPostFieldsSchema>;

// localized-only — maps on localized:true fields, normalized by transportField()
export const BlogPostLocalizedFieldsSchema = z.object({
  title: transportField(z.record(ContentfulLocaleCodeSchema, z.string().max(256))),
  slug: transportField(z.string()),
  author: transportField(ContentfulEntryLinkSchema),
});

export type BlogPostLocalizedFields = z.infer<typeof BlogPostLocalizedFieldsSchema>;
```

## Generated helpers

Helpers are pure functions in the same output file. They **do not validate** — parse after flattening:

```ts
import {
  BlogPostLocalizedEntrySchema,
  BlogPostFieldsSchema,
  flattenBlogPostLocalizedEntryFields,
} from "./generated/contentful.schemas";

const entry = BlogPostLocalizedEntrySchema.parse(rawFromContentful);
const flat = flattenBlogPostLocalizedEntryFields(entry.fields, "it-IT");
const post = BlogPostFieldsSchema.parse(flat);
```

- **`pickLocale`** — read one locale from a localized delivery field (`Record<ContentfulLocaleCode, T> | null`); missing locale or `null` input → `null`. Default locale parameter is `CONTENTFUL_DEFAULT_LOCALE`.
- **`flatten{ContentType}LocalizedFields`** — map validated `*LocalizedFields` from `entry.fields` → flat `*Fields` for one locale (one per content type when both `none` and `localized-only` are enabled). Passes `null` through for absent localized values.

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

Overrides apply to the **base field type** `T`. In delivery mode, localized fields wrap `z.record(ContentfulLocaleCodeSchema, T).nullable()` around that base (plus `.optional()` when applicable).

Overrides are inlined at codegen time — the config is not imported at runtime.

## Mapping Delivery / REST data

1. Parse raw entries with `*EntrySchema.parse(...)`.
2. Flatten validated `entry.fields` with `flatten*LocalizedFields(...)` when both `none` and `localized-only` are enabled.
3. Validate the flat shape with `*FieldsSchema.parse(...)`.

Entry/asset link objects and CMA validations (size, range, regex, etc.) are reflected in the generated Zod chains.

## Resolved entry links (`linkContentType`)

Contentful REST does not include the target content type on unresolved link stubs. The CMA field validation `linkContentType` is the source of truth — the codegen reads it from your content-type snapshot (no extra config).

When `locale.mode` includes delivery, the generated file also exports `parseEntryAsLinkField` for fields that declare `linkContentType`:

```ts
import {
  BlogPostLocalizedEntrySchema,
  parseEntryAsLinkField,
} from "./generated/contentful.schemas";

const post = BlogPostLocalizedEntrySchema.parse(rawPost);
const authorLink = post.fields.author; // unresolved link stub

const resolvedAuthor = await contentfulClient.getEntry(authorLink!.sys.id);
const author = parseEntryAsLinkField("blogPost", "author", resolvedAuthor);
// `author` is typed as AuthorLocalizedEntry when linkContentType is ["author"]
```

- **Single target** → return type is that `*Entry` type.
- **Multiple targets** → union of the allowed `*Entry` types; narrow with `entry.sys.contentType.sys.id`.
- Wrong content type → `LinkFieldTargetError` with parent field id and allowed targets.
- **`getAllowedEntryLinkContentTypes(parentCtype, fieldName)`** → readonly allow-list from CMA (same data as the parser uses; useful before fetch or for custom checks).

Target content types must be present in the same snapshot used for codegen.

## xndrjs recipe (optional)

Wire flat field schemas and the locale enum into `@xndrjs/domain-zod`:

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { BlogPostFieldsSchema, ContentfulLocaleCodeSchema } from "./generated/contentful.schemas";

export const BlogPost = domain.shape("BlogPost", zodToValidator(BlogPostFieldsSchema));

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
