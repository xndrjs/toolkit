---
title: "Stop hand-writing Contentful types: generate Zod schemas instead"
description: Every Contentful team eventually hand-rolls types or GraphQL codegen. @xndrjs/contentful-to-zod turns your content model into executable Zod schemas—validation, transforms, locale flattening, and honest inferred types at runtime.
date: 2026-05-29
tags:
  - contentful
  - zod
  - cms
  - codegen
---

If you've used Contentful long enough, you've probably written one of these:

```ts
type BlogPost = {
  title: string;
  slug: string;
};
```

Or maybe you generated types with GraphQL codegen.

Either way, you've solved only half the problem.

Contentful knows your content model. TypeScript knows your types. **But neither validates what actually arrives at runtime.**

---

## The SDK doesn't know your model

You start with the official client:

```ts
const entry = await client.getEntry("abc123");
```

TypeScript knows very little. Worse:

```ts
entry.fields.title;
```

is mostly a convention — not a contract tied to your space, your content types, or your validations.

One may eventually ask: _why doesn't Contentful ship Zod (or anything executable) from the content model?_ Or: _why am I writing my own codegen because the SDK has no idea what `blogPost` looks like?_

That pain is real. Preview quirks and missing `required` fields are real — but they hit hardest after you've already felt the bigger gap: **the model lives in Contentful, the types live in your repo, and nothing connects them at runtime.**

---

## So someone writes custom types

Hand-rolled interfaces. Custom codegen. It works — for a while.

Then your mapper layer grows. Every content type needs the same boilerplate repeated in slightly different shapes:

- **Localization** — the same field is a plain string in a single-locale response and a locale record in a multi-locale one (`title: "Hello"` vs `title: { "en-US": "Hello", "it-IT": "Ciao" }`). Your types and transforms must handle both, or you standardize on one fetch strategy and still write the glue by hand.
- **Missing values** — Contentful often omits empty fields instead of sending `null`. Your code must coalesce `undefined`, missing keys, and explicit `null` into something consistent, field by field, entry by entry.
- **`Object` fields** — CMA gives you a blob with no inner schema. Someone has to narrow `Record<string, unknown>` into a real shape, in one place or scattered across the app.

None of this is unique to your product. It is repetitive infrastructure that only adds weight to the codebase — work your team would rather not own when there are higher-level problems to solve.

### "But I use GraphQL codegen"

If the GraphQL API is enough for your stack, graphql-codegen is a good fit.

But two things may still push you toward something else:

- **GraphQL is not REST** - the Delivery SDK exposes capabilities GraphQL does not mirror one-to-one, for example multi-locale requests (i.e. `locale=*`). Many production setups use REST, a BFF over REST, or a mix. They still need a type layer, and often end up maintaining one by hand alongside codegen.
- **Codegen gives you compile-time types, not runtime contracts** - generated types vanish after build; nothing validates the JSON when it lands.
- **GraphQL schema is less expressive than Contentful's content-type definition in the CMA** - a Symbol field restricted to a fixed set of allowed values in Contentful often appears in GraphQL as `String` — so TypeScript sees `string`, not a union of the only legal values. Tighter rules from CMA validations do not flow through, unless you encode them again somewhere else. Conversely, `@xndrjs/contentful-to-zod` maps those validation rules into native Zod enums, giving you true string literal unions.

The key takeaway here is:

> TypeScript narrows assumptions. Runtime validation narrows reality.

### Example: `required` is not “always present”

A concrete divergence every Preview user hits sooner or later:

> **`required` in Contentful means “required to publish”, not “always present in the API response”.**

```ts
// Draft: slug saved, title not filled yet
{
  sys: { id: "abc123", type: "Entry" /* ... */ },
  fields: {
    slug: "my-draft-post",
    // title omitted — Contentful's usual shape for empty fields
  }
}
```

Your hand-written `BlogPost` says `title: string`. The payload says otherwise. TypeScript never saw the JSON — it only believed the model. See also [5 cases where TypeScript types are not enough](/latest/blog/typescript-types-not-enough-data-correctness/).

```txt
publishability ≠ runtime certainty
```

This is one symptom of the gap between compile-time types and runtime payloads — not the whole story.

---

## Types don't run at runtime

Inferred types erase at compile time. They cannot, by themselves:

- **Validate** payloads
- **Normalize** omitted keys vs explicit `null`
- **Flatten** multi-locale fields into a single-locale object
- **Verify `Object` fields** — CMA declares `Object` without an inner shape; your `Record<string, unknown>` is hope, not a contract

GraphQL codegen and hand-written interfaces give you **inferred types**. They do not give you an **executable artifact** at the boundary.

---

## Multi-locale fetch, single-locale use

Another question that comes up in enterprise apps, BFFs, and static site generators: _if my domain works on one locale at a time, why fetch multi-locale at all?_

In some cases, the pattern may be the opposite of one HTTP call per language:

1. Request with `?locale=*` once — full locale tree, one round trip (respects rate limits, lowers latency).
2. **Cache** the transport payload (Redis, in-memory, build artifact) as the source of truth downstream.
3. **Flatten on read** — same cached `fields` becomes `{ title: "Ciao" }` for `/it/...` and `{ title: "Hello" }` for `/en/...` via `flatten*EntryFields(fields, locale)`.

Store multi-locale, project single-locale when the page needs it. Types alone do not encode that split between transport shape and locale-specific representation.

**Word of caution:** payload size grows with locale count. `locale=*` across dozens of languages can bloat JSON, memory, and cache. Multi-locale fetch makes sense for subsets of content, not necessarily every content type in every use case.

---

## What you actually need: runtime schemas

Don't ask the CMS schema to be your domain model. Ask it to describe what **can** arrive; decide separately what you **trust**.

1. **Parse the transport payload** — Delivery or Preview JSON, localized records, links — without assuming editorial rules hold at runtime.
2. **Flatten per locale** when needed — one flat object per locale from the same cached entry.
3. **Validate the flat shape** — still permissive at this layer.
4. **Apply domain rules** — “title must be non-empty”, draft OK on preview only, fallbacks, and so on.
5. **Use the result in app code** — UI, caching, business logic.

Parsing is not trust. It tells you what showed up. Whether a draft with no title is OK is your call — not Contentful's, not the codegen's.

That pipeline needs **runtime schemas**, not just types:

```txt
Contentful model
↓
Generated Zod schema
↓
Validation
↓
Transform / normalize / flatten
↓
Type inference (z.infer)
```

---

## `@xndrjs/contentful-to-zod`: model → executable artifact

[`@xndrjs/contentful-to-zod`](https://github.com/xndrjs/toolkit/tree/main/packages/contentful-to-zod) generates **Zod 4** schemas from your content types via the CMA. One codegen step turns the content model into something that **runs** at the boundary: parse, normalize, flatten, infer.

For a `blogPost` with localized `title` and optional `author`:

```ts
export const BlogPostDeliveryFieldsSchema = z.object({
  title: transportField(z.record(ContentfulLocaleCodeSchema, z.string().max(256))),
  slug: transportField(z.string()),
  author: transportField(ContentfulEntryLinkSchema),
});

export const BlogPostFieldSchema = z.object({
  title: flatField(z.string().max(256)),
  slug: flatField(z.string()),
  author: flatField(ContentfulEntryLinkSchema),
});

export const BlogPostEntrySchema = z.object({
  sys: /* ... */,
  fields: BlogPostDeliveryFieldsSchema,
});
```

With Zod you get at once: **runtime validation**, **parsing**, **transforms**, **normalization**, and **inferred types**. GraphQL codegen or hand-written TS gives you the last item only.

### What are `transportField` and `flatField`?

Field wrappers that **normalize missing values** — omitted keys and explicit `null` both become `null`:

```ts
export function transportField<T extends z.ZodType>(schema: T) {
  return schema
    .nullable()
    .optional()
    .transform((v) => v ?? null);
}

export function flatField<T extends z.ZodType>(schema: T) {
  return schema
    .nullable()
    .optional()
    .transform((v) => v ?? null);
}
```

Same implementation _today_, **different semantic meaning**, because they are helpers for two different kinds of schemas:

- `transportField` marks a **Contentful payload** (delivery/preview, locale records)
- `flatField` marks a **locale-flattened** shape after `flatten*EntryFields`.

In the future, we may configure the codegen to apply different rules in `transportField` and `flatField`, so it makes sense to have them separated from the start.

### Honest types and `Object` fields

`z.infer<typeof BlogPostFields>["title"]` is `string | null` — types that match what can actually arrive.

CMA validations flow into inner Zod chains. `Object` fields default to permissive:

```ts
metadata: flatField(z.record(z.string(), z.unknown())),
```

You can tighten them in config — turning fuzzy CMA blobs (_“here be dragons”_) into something **explicit and catalogued**:

```ts
objects: {
  "blogPost.metadata": z.object({ seoTitle: z.string(), noIndex: z.boolean().optional() }),
}
```

Defined once, inlined at codegen, validated in one place.

### The pipeline

```ts
const entry = BlogPostEntrySchema.parse(rawFromContentful);
const flat = flattenBlogPostEntryFields(entry.fields, "it-IT");
const post = BlogPostFieldSchema.parse(flat);

// optional: domain trust layer
const PublishedPost = BlogPostFieldSchema.extend({
  title: z.string().min(1),
});
const trusted = PublishedPost.parse(flat);
```

Three lines at the boundary. No hand-written transport validators. No hand-written locale flatteners. Fewer transport-to-app mapping utilities.

If you use [xndrjs](/latest/v0/adapters/zod/), wire flat schemas with `zodToValidator` — transport feeds the domain; it does not replace it.

---

## Try it

Install the library itself and Zod 4 as a peer dependency:

```bash
pnpm add @xndrjs/contentful-to-zod zod@^4
```

Download content types and locales from Contentful, and run the codegen:

```bash
contentful-to-zod \
  --space-id "YOUR_SPACE_ID" \
  --management-token "YOUR_MANAGEMENT_TOKEN" \
  --environment master \
  --out ./contentful.schemas.ts \
  --snapshot ./content-types.json \
  --snapshot-locales ./locales.json
```

Or run the codegen on already downloaded content types and locales:

```bash
contentful-to-zod \
  --from-snapshot \
  --snapshot ./content-types.json \
  --snapshot-locales ./locales.json \
  --out ./src/generated/contentful.schemas.ts
```

Full docs:

- [Contentful to Zod](/latest/v0/infrastructure/contentful-to-zod/)
- [README in monorepo](https://github.com/xndrjs/toolkit/tree/main/packages/contentful-to-zod)
- [package map](/latest/v0/reference/package-map/)
