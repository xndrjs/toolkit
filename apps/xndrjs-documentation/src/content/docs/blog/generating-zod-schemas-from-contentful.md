---
title: "Generating Zod schemas from Contentful: why your project needs this"
description: How @xndrjs/contentful-to-zod turns your Contentful content model into precise Zod 4 schemas.
date: 2026-05-29
author: Fabio Fognani
tags:
  - contentful
  - zod
  - cms
  - codegen
---

I have been working with Contentful for about three years now.

On projects using GraphQL API, I used graphql-codegen and moved on. When I started working more heavily with the Contentful REST APIs, I wrote a custom codegen — nothing exotic, just enough to generate types from the content model and avoid the most tedious boilerplate.

It worked, but it had gaps. After running into the same issues a few times I realized: _none of this is specific to my project_. And I'm going to need this again. And again.

So I rebuilt it properly as [`@xndrjs/contentful-to-zod`](https://github.com/xndrjs/toolkit/tree/main/packages/contentful-to-zod) — the way I'd want any infrastructure tool in the `xndrjs` ecosystem to work.

Here's what the gaps were, and what this tool does differently.

---

## What my custom codegen was missing

### 1. The `required` assumption

My codegen was initially treating `required` fields as non-optional in the generated types. Which makes sense — until you hit Preview.

In Contentful, `required` means _required to publish_, not _always present in the API response_. A draft entry with `slug` filled in but `title` empty is a perfectly valid response:

```json
{
  "sys": { "id": "abc123" },
  "fields": {
    "slug": "my-draft-post"
  }
}
```

`title` is just absent. Not `null`. The generated type said `title: string`. That was wrong.

### 2. Localization was an afterthought

Fetching with `?locale=*` changes the shape of every localized field:

```json
{ "title": { "en-US": "Hello", "it-IT": "Ciao" } }
```

Single-locale response:

```json
{ "title": "Hello" }
```

Same field, two completely different shapes. My codegen generated one shape and assumed I'd sort out the other. The transforms that went from transport payload to flat, locale-specific object were hand-written glue that lived outside the codegen, inconsistently.

### 3. `Object` fields were untyped

The CMA declares `Object` fields without any inner schema. My codegen, just like graphql-codegen, initially rendered them as `Record<string, unknown>`. Technically correct, practically useless or brittle for anything downstream.

### 4. Every Entry Link looked the same over REST

This one stayed annoying for a long time.

In the Contentful UI you can restrict a **Link to entry** field to specific content types (`linkContentType` in the CMA). Your model knows that `blogPost.author` points at an `author` entry. The REST and Delivery APIs **do not**: an unresolved link is always the same stub — `{ sys: { type: "Link", linkType: "Entry", id: "..." } }` with **no** target content type on the wire.

My first codegen tried to paper over that with **branded types** on the link stub itself, as if `author` were already an `AuthorLink` before fetch. It "worked", but it was the wrong approach: I was inferring the target **before** the entry was resolved. A workaround, not a clean boundary — the real information only exists once you have the full entry (`sys.contentType.sys.id` after `include` or `getEntry`).

---

## The actual gap: types vs. runtime

The tools I had — both graphql-codegen and my custom tool — were good at one thing: **compile-time types**. They told the compiler what shape to expect. What they couldn't do:

- Validate what actually arrived at runtime
- Normalize omitted keys, `undefined`, and explicit `null` into something consistent
- Flatten a multi-locale field into a single locale on read
- Narrow `Object` fields to a real inner shape
- After resolving a link, narrow the entry to the content types the CMA allows for that field

That's not a flaw in those tools — it's just what they're for. But the boundary between Contentful and my app was mine to own, and types alone weren't enough there.

---

## What `contentful-to-zod` generates instead

Rather than TypeScript interfaces, the tool generates **Zod 4 schemas** — artifacts that run at the boundary, not just at compile time.

For a `blogPost` content type with a localized `title` and an optional `author` link, it looks something like this:

```ts
// Transport shape — what comes over the wire
export const BlogPostDeliveryFieldsSchema = z.object({
  title: transportField(z.record(ContentfulLocaleCodeSchema, z.string().max(256))),
  slug: transportField(z.string()),
  author: transportField(ContentfulEntryLinkSchema),
});

// Flat shape — after locale flattening
export const BlogPostFieldsSchema = z.object({
  title: flatField(z.string().max(256)),
  slug: flatField(z.string()),
  author: flatField(ContentfulEntryLinkSchema),
});
```

Two schemas — one for the transport layer, one for the flat locale-specific shape. CMA validations like `.max(256)` flow into the Zod chains. And `z.infer` gives accurate types: where graphql-codegen gives you `string` for a Symbol field with allowed values, this gives you the actual union.

`transportField` and `flatField` normalize absent values to `null`:

```ts
export function transportField<T extends z.ZodType>(schema: T) {
  return schema
    .nullable()
    .optional()
    .transform((v) => v ?? null);
}
```

They look identical _today_, but the semantic distinction matters: one marks a Contentful wire payload, the other a locale-flattened shape. It keeps the door open for diverging behavior in future codegen without touching consuming code.

### At the boundary

```ts
const entry = BlogPostEntrySchema.parse(rawFromContentful);
const flat = flattenBlogPostEntryFields(entry.fields, "it-IT");
const post = BlogPostFieldsSchema.parse(flat);
```

The `flatten*` helper is also generated — one per content type when using `locale.mode: "both"` (the default). No more hand-written glue per content type. No more `isRecord` utils to guess if some value is localized or not (this was actually the solution AI kept suggesting me before I decided to design a more structured solution, and it **gave me the shivers**).

Domain rules stay separate:

```ts
const PublishedPost = BlogPostFieldsSchema.extend({
  title: z.string().min(1),
});
const trusted = PublishedPost.parse(flat);
```

---

## The multi-locale caching pattern

Having explicit transport and flat schemas also made another pattern cleaner: fetch once with `?locale=*`, cache the full multi-locale payload, flatten on read.

```
?locale=* → cache raw multi-locale entry
→ flattenBlogPostEntryFields(fields, "it-IT") for /it/...
→ flattenBlogPostEntryFields(fields, "en-US") for /en/...
```

Same cached entry, different flat object per locale. **Worth noting** that payload size grows with locale count — this makes more sense for subsets of content than for everything in your space, please keep it in mind!

---

## `Object` field overrides

By default, `Object` fields generate `z.record(z.string(), z.unknown())`. For fields where the inner shape is known, you can narrow them in config:

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

Inlined at codegen time — no runtime dependency on the config.

---

## Entry links: validate after resolve

`@xndrjs/contentful-to-zod` reads `linkContentType` from your content-type snapshot — same source of truth as the CMA, no duplicate config. On the transport schemas, `author` stays a generic entry link (`ContentfulEntryLinkSchema`): that's what Contentful actually sends.

Once you have the **resolved** entry, validation moves to the right boundary. The generated helper `parseEntryAsLinkField` ties parent content type + field name to the allowed targets and parses with the matching `*EntrySchema`:

```ts
import { BlogPostEntrySchema, parseEntryAsLinkField } from "./generated/contentful.schemas";

const post = BlogPostEntrySchema.parse(rawPost);
const authorLink = post.fields.author;

const resolvedAuthor = await client.getEntry(authorLink!.sys.id);
const author = parseEntryAsLinkField("blogPost", "author", resolvedAuthor);
// `author` is `AuthorEntry` when the CMA allows only `author`
```

**Single allowed content type** — the return type is that entry type directly. No second ceremony.

**Multiple allowed types** — the return type is a union of the corresponding `*Entry` types. A second discriminated union on `entry.sys.contentType.sys.id` (now narrowed to that union) picks the branch:

```ts
const linked = parseEntryAsLinkField("blogPost", "related", resolved);

switch (linked.sys.contentType.sys.id) {
  case "author":
    // linked is AuthorEntry
    break;
  case "blogPost":
    // linked is BlogPostEntry
    break;
}
```

Wrong content type for the field → `LinkFieldTargetError` with the parent field id and the allowed list from the model.

Architecturally: **unresolved link** = transport shape only; **resolved entry** = `parseEntryAsLinkField` + optional `switch` for multi-type fields. Inference lives where the data actually carries the content type — not on the stub.

---

## Setup

```bash
pnpm add zod@^4
pnpm add -D @xndrjs/contentful-to-zod @dotenvx/dotenvx
```

Keep codegen options in `contentful-to-zod.config.ts`. Use whichever env var names fit your project:

```ts
import { defineConfig } from "@xndrjs/contentful-to-zod";

export default defineConfig({
  cma: {
    spaceId: process.env.CONTENTFUL_BLOG_SPACE_ID,
    managementToken: process.env.CONTENTFUL_BLOG_MANAGEMENT_TOKEN,
    environment: process.env.CONTENTFUL_BLOG_ENVIRONMENT ?? "master",
  },
  out: "./src/generated/contentful.schemas.ts",
  snapshot: "./content-types.json",
  snapshotLocales: "./locales.json",
});
```

Then add codegen scripts to `package.json` so your package manager resolves the local CLI and loads `contentful-to-zod.config.ts`:

```json
{
  "scripts": {
    "contentful:schema": "dotenvx run -- contentful-to-zod --config ./contentful-to-zod.config.ts"
  }
}
```

Fetch from your space and generate:

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
  --snapshot ./content-types.json \
  --snapshot-locales ./locales.json
```

No runtime dependency on `@xndrjs/contentful-to-zod` in production — only the generated file and `zod`.

---

**Related Links**

- [Docs: contentful-to-zod](/latest/infrastructure/contentful-to-zod/)
- [GitHub: xndrjs/toolkit](https://github.com/xndrjs/toolkit/tree/main/packages/contentful-to-zod)
- [Related: 5 cases where TypeScript types are not enough](/latest/blog/typescript-types-not-enough-data-correctness/)
