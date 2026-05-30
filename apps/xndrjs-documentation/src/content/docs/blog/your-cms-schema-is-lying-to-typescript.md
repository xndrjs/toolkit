---
title: "Your CMS schema is lying to TypeScript"
description: Why Contentful “required” fields are absent or null at runtime—and how transport-aware Zod schema generation with @xndrjs/contentful-to-zod (flatField, transportField) separates transport truth from domain trust.
date: 2026-05-29
tags:
  - contentful
  - zod
  - validation
  - cms
---

You mark `title` as **required** in Contentful. Codegen gives you `title: string`. You ship.

Then Preview blows up, or worse, silently renders blank until someone notices:

```ts
// Draft entry: slug saved, title not filled yet
{
  sys: { id: "abc123", type: "Entry" /* ... */ },
  fields: {
    slug: "my-draft-post",
    // title omitted — Contentful's usual shape for empty fields
  }
}
```

`post.title.toUpperCase()` was never safe. TypeScript never saw the payload. It only believed the content model.

---

## The trap in one sentence

> **`required` in Contentful means “required to publish”, not “always present in the API response”.**

Drafts in preview, legacy entries, schema changes that old rows never caught up with: the CMS model describes **editorial intent**, your app consumes **transport payloads**. Those are not the same thing.

Generated TypeScript types make it worse: they encode the ideal, not what Delivery or Preview actually return. See [5 cases where TypeScript types are not enough](/latest/blog/typescript-types-not-enough-data-correctness/) if you want the general version of this problem.

```txt
publishability ≠ runtime certainty
```

---

## Split transport from domain

Don't ask the CMS schema to be your domain model. Ask it to describe what **can** arrive; decide separately what you **trust**.

1. **Receive the raw response** from Contentful (Delivery or Preview). Check that the payload looks like what you expect — types, links, localized records — without assuming every “required” field is there.
2. **Pick one locale and flatten the entry**. Turn `title: { "it-IT": "Ciao" }` into a single `title: "Ciao"`. Treat missing fields as empty (`null`), not as “surely a string”.
3. **Validate the flat shape** — still permissive: a missing title is allowed at this stage.
4. **Apply your own rules** — only here decide what is acceptable for your domain: “title must be non-empty”, “draft OK on preview, not on production”, fallback to another locale, and so on.
5. **Use the result in app code** — UI, caching, business logic. This is the object you actually trust.

Parsing is not trust. It tells you what showed up. Whether a draft with no title is OK for your app is your call — not Contentful's, not the codegen's.

---

## What does `@xndrjs/contentful-to-zod` generate?

[`@xndrjs/contentful-to-zod`](https://github.com/xndrjs/toolkit/tree/main/packages/contentful-to-zod) generates **Zod 4** schemas from your content types via the Contentful Management API (CMA).

For a `blogPost` with localized `title` (required in CMA) and optional `author`, the generated file looks roughly like this:

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

### Why two names if the implementation is the same?

Same implementation _today_. **Different semantic meaning.**

`transportField` marks a field in a **Contentful payload** — delivery/preview JSON, locale records, raw API shape. `flatField` marks a field in a **locale-flattened representation** — one value per field, after `flatten*EntryFields`.

Future readers should be able to tell immediately which contract a schema describes, without reading the whole file. Otherwise someone will ask: _“Why do you have two identical functions?”_

The real answer is not duplication: **they describe different contracts.**

### What do you get?

`z.infer<typeof BlogPostFields>["title"]` is `string | null`. That's the point: honest types, not wishful ones.

CMA validations (max length, regex, enums, link shapes) flow into the inner Zod chains. `Object` fields have no inner shape in CMA, so the generator defaults to something permissive:

```ts
metadata: flatField(z.record(z.string(), z.unknown())),
```

You can tighten them in config — turning `Object` fields, which are **fuzzy by default** (_“here be dragons”_), into something **explicit and catalogued** in your codebase:

```ts
objects: {
  "blogPost.metadata": z.object({ seoTitle: z.string(), noIndex: z.boolean().optional() }),
}
```

The schema is defined once, inlined at codegen time, and validated in one place — not scattered ad hoc checks wherever someone reads `metadata`.

---

## The pipeline

```ts
const entry = BlogPostEntrySchema.parse(rawFromContentful);
const flat = flattenBlogPostEntryFields(entry.fields, "it-IT");
const post = BlogPostFieldSchema.parse(flat);

// optional: tighten for pages that need a real title
const PublishedPost = BlogPostFieldSchema.extend({
  title: z.string().min(1),
});
const trusted = PublishedPost.parse(flat);
```

Three lines at the boundary. No hand-written mappers that drift from the types. Generated `flatten*EntryFields` puts `?? null` on every field; `pickLocale` handles localized records.

---

## Why not just GraphQL codegen?

The question will come up.

GraphQL codegen generates compile-time types. At the boundary, that is not enough:

- **Normalize omitted values** — a missing key stays missing in the type system; nothing coalesces absent fields to `null` when the payload arrives.
- **Single-locale or multi-locale, your call** — Delivery/Preview can return all locales in each field (`title: { "en-US": "...", "it-IT": "..." }`) or you fetch one locale at a time. Parse once with `*EntrySchema`, then `flattenBlogPostEntryFields(entry.fields, locale)` to build one flat object per locale; change the locale argument when you need another. GraphQL types do not encode that split between transport shape and locale-specific flat representation.

---

## Try it

```bash
pnpm add @xndrjs/contentful-to-zod zod@^4

contentful-to-zod \
  --from-snapshot \
  --snapshot ./content-types.json \
  --snapshot-locales ./locales.json \
  --out ./src/generated/contentful.schemas.ts
```

Rebuild the package locally before codegen if you're hacking on the generator (`pnpm run build` in `packages/contentful-to-zod`).

Full docs: [Contentful to Zod](/latest/v0/infrastructure/contentful-to-zod/) · [README in monorepo](https://github.com/xndrjs/toolkit/tree/main/packages/contentful-to-zod) · [package map](/latest/v0/reference/package-map/).

> **TypeScript narrows assumptions. Runtime validation narrows reality.**
