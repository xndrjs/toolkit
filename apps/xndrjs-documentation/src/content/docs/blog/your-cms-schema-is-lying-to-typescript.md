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

You mark `title` as **Required** in Contentful. Codegen gives you `title: string`. You ship.

Then Preview blows up, or worse, renders blank:

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

Drafts, Preview, legacy entries, missing locales, schema changes that old rows never caught up with — the CMS model describes **editorial intent**. Your app consumes **transport payloads**. Those are not the same thing.

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

Parsing is not trust. It tells you what showed up. Whether a draft with no title is OK for _this_ page is your call — not Contentful's, not the codegen's.

---

## What `@xndrjs/contentful-to-zod` generates

[Zod 4 schemas](https://github.com/xndrjs/toolkit/tree/main/packages/contentful-to-zod) from your CMA content types. The generator emits two names for the **same** normalization logic — not a mistake:

```ts
// Same implementation: missing key or explicit null → null
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

**Why two names?** So you can tell which layer you are validating at a glance: `transportField` wraps delivery/preview payloads (locale records, raw API shape); `flatField` wraps the single-locale shape after flatten. Same behavior, different contract in the generated file.

For a `blogPost` with localized `title` (required in CMA) and optional `author`:

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

`z.infer<typeof BlogPostFields>["title"]` is `string | null`. That's the point — honest types, not wishful ones.

CMA validations (max length, regex, enums, link shapes) flow into the inner Zod chains. `Object` fields default to permissive; you can tighten them in config:

```ts
objects: {
  "blogPost.metadata": z.object({ seoTitle: z.string(), noIndex: z.boolean().optional() }),
}
```

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

If you use [xndrjs](/latest/v0/adapters/zod/), wire the flat schema into a domain shape with `zodToValidator` — transport schemas feed the domain; they don't replace it.

---

## Same lesson everywhere

Contentful is the example, not the exception. GraphQL non-null fields, OpenAPI `required`, DB `NOT NULL` — external schemas describe intent; runtime sends omissions, nulls, and legacy garbage. **Model transport honestly. Enforce trust in your domain.**

For OpenAPI specifically: [OAS → JSON Schema → AJV → domain](/latest/blog/oas-jsonschema-ajv-domain/).

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

Full docs: [`packages/contentful-to-zod`](https://github.com/xndrjs/toolkit/tree/main/packages/contentful-to-zod) · [package map](/latest/v0/reference/package-map/).

> **TypeScript narrows assumptions. Runtime validation narrows reality.**
