# @xndrjs/contentful-to-zod

Generate **Zod 4** schemas from Contentful content types (CMA). Stop hand-writing codegen and get precise `z.infer` types where graphql-codegen stays on `string`.

This package outputs **Zod schemas and optional locale helpers only** — no `domain.shape` in the generated file. If you use [xndrjs](https://github.com/xndrjs/toolkit), wire schemas with `zodToValidator` from [`@xndrjs/domain-zod`](../domain-zod) in your own code.

## Principles

- **1:1 mapping** from the CMA content model to Zod (field type + `validations` + `required`).
- **Two schema shapes** (configurable): **flat / CMA** (single value per field) and **delivery** (`localized: true` → `z.record(ContentfulLocaleCodeSchema, T)`).
- **Default `locale.mode: "both"`** — each content type exports flat + delivery schemas (e.g. `BlogPostSchema` + `BlogPostDeliverySchema`) plus `flatten*` helpers when both are emitted.
- **Locales from your space** — enum and constants are generated from a CMA `/locales` snapshot; `CONTENTFUL_DEFAULT_LOCALE` is only the default parameter for helpers (no runtime rule that the default locale must exist in every record).
- **Self-contained output** — generated file depends only on `zod`; shared primitives (entry/asset links, location, …) are inlined once at the top.
- **Optional Object overrides** — CMA declares `Object` without inner shape; supply Zod schemas via config for `{contentTypeId}.{fieldId}` keys.

## Install

```bash
pnpm add zod@^4
pnpm add -D @xndrjs/contentful-to-zod @dotenvx/dotenvx
```

## CLI

Because `@xndrjs/contentful-to-zod` is a codegen dependency, add scripts to `package.json` and run the local CLI through your package manager. The CLI reads `CONTENTFUL_SPACE_ID`, `CONTENTFUL_MANAGEMENT_TOKEN`, and `CONTENTFUL_ENVIRONMENT` from env, so you can keep credentials in `.env`:

```dotenv
CONTENTFUL_SPACE_ID=your_space_id
CONTENTFUL_MANAGEMENT_TOKEN=your_management_token
CONTENTFUL_ENVIRONMENT=master
```

```json
{
  "scripts": {
    "contentful:schema": "dotenvx run -- contentful-to-zod --out ./src/generated/contentful.schemas.ts --snapshot ./src/generated/content-types.json --snapshot-locales ./src/generated/locales.json"
  }
}
```

Live fetch from CMA (writes snapshots for reproducible CI):

```bash
pnpm run contentful:schema
```

For a one-off run, you can also use `npx`:

```bash
npx @dotenvx/dotenvx run -- npx @xndrjs/contentful-to-zod \
  --out ./src/generated/contentful.schemas.ts \
  --snapshot ./src/generated/content-types.json \
  --snapshot-locales ./src/generated/locales.json
```

Other flags: `--content-types blogPost,author`, `--config ./contentful-to-zod.config.ts`, `--dry-run` (print to stdout).

Environment fallbacks: `CONTENTFUL_MANAGEMENT_TOKEN`, `CONTENTFUL_SPACE_ID`, `CONTENTFUL_ENVIRONMENT`.

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

| `locale.mode`      | Generated exports                                                       |
| ------------------ | ----------------------------------------------------------------------- |
| `"cma"`            | Flat schemas only (`BlogPostSchema`, `BlogPostFields`)                  |
| `"delivery"`       | Delivery schemas + `pickLocale` + locale enum/constants                 |
| `"both"` (default) | Flat + delivery + `pickLocale` + `flatten{Type}Fields` per content type |

Rules:

- **Flat and delivery** field schemas are **nullable** (Preview/draft and `pickLocale` can yield `null`; optional CMA fields also `.optional()`).
- **`localized: true`** — flat uses `T`; delivery uses `z.record(ContentfulLocaleCodeSchema, T)` (same nullability rules on the outer field).
- **`disabled` / `omitted`** fields are still included (full blueprint).

### Generated locale primitives

When delivery or both mode is active, the file starts with:

```ts
/** @generated from space locales snapshot */
export const ContentfulLocaleCodeSchema = z.enum(["en-US", "it-IT"]);
export type ContentfulLocaleCode = z.infer<typeof ContentfulLocaleCodeSchema>;

export const CONTENTFUL_LOCALE_CODES = ContentfulLocaleCodeSchema.options;
export const CONTENTFUL_DEFAULT_LOCALE = "en-US" as const;
```

### Flat vs delivery example

```ts
// flat / CMA — single value per field (nullable for pickLocale / flatten)
export const BlogPostSchema = z.object({
  title: z.string().max(256).nullable(),
  slug: z.string().nullable(),
  author: ContentfulEntryLinkSchema.nullable().optional(),
});

export type BlogPostFields = z.infer<typeof BlogPostSchema>;

// delivery — REST/Preview (all fields nullable; optional CMA fields also .optional())
export const BlogPostDeliverySchema = z.object({
  title: z.record(ContentfulLocaleCodeSchema, z.string().max(256)).nullable(),
  slug: z.string().nullable(),
  author: ContentfulEntryLinkSchema.nullable().optional(),
});

export type BlogPostDeliveryFields = z.infer<typeof BlogPostDeliverySchema>;
```

## Generated helpers

Helpers are pure functions in the same output file. They **do not validate** — parse after flattening:

```ts
import { BlogPostSchema, flattenBlogPostFields, pickLocale } from "./generated/contentful.schemas";

const flat = flattenBlogPostFields(deliveryFields, "it-IT");
const post = BlogPostSchema.parse(flat);
```

- **`pickLocale`** — read one locale from a localized delivery field (`Record<ContentfulLocaleCode, T> | null`); missing locale or `null` input → `null`. Default locale parameter is `CONTENTFUL_DEFAULT_LOCALE`.
- **`flatten{ContentType}Fields`** — map `*DeliveryFields` → flat `*Fields` for one locale (one per content type when `mode` is `both`). Passes `null` through for absent localized values.

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

1. Parse or type raw `fields` as `*DeliveryFields` (or use `flatten*` when `mode` is `both`).
2. Validate the flat shape with `*Schema.parse(...)`.

Entry/asset link objects and CMA validations (size, range, regex, etc.) are reflected in the generated Zod chains.

## xndrjs recipe (optional)

Wire flat field schemas and the locale enum into `@xndrjs/domain-zod`:

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { BlogPostSchema, ContentfulLocaleCodeSchema } from "./generated/contentful.schemas";

export const BlogPost = domain.shape("BlogPost", zodToValidator(BlogPostSchema));

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
