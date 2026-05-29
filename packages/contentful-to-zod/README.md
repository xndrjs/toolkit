# @xndrjs/contentful-to-zod

Generate **Zod 4** schemas from Contentful content types (CMA). Stop hand-writing codegen and get precise `z.infer` types where graphql-codegen stays on `string`.

This package outputs **Zod schemas only** — no domain helpers in the generated file. If you use [xndrjs](https://github.com/xndrjs/toolkit), wire schemas with `zodToValidator` from [`@xndrjs/domain-zod`](../domain-zod) in your own code.

## Principles

- **1:1 mapping** from the CMA content model to Zod (field type + `validations` + `required`).
- **No locale unwrapping** — `localized` does not change the schema shape.
- **Self-contained output** — generated file depends only on `zod`; shared primitives (entry/asset links, location, …) are inlined once at the top.
- **Optional Object overrides** — CMA declares `Object` without inner shape; you can supply Zod schemas via config for specific `{contentTypeId}.{fieldId}` keys.

## Install

```bash
pnpm add @xndrjs/contentful-to-zod zod@^4
```

## CLI (coming soon)

```bash
contentful-to-zod \
  --space-id $SPACE \
  --environment master \
  --management-token $TOKEN \
  --out ./src/generated/contentful.schemas.ts \
  --snapshot ./src/generated/content-types.json
```

Environment fallbacks: `CONTENTFUL_MANAGEMENT_TOKEN`, `CONTENTFUL_SPACE_ID`, `CONTENTFUL_ENVIRONMENT`.

## Programmatic API (coming soon)

```ts
import {
  fetchContentTypes,
  generateZodSchemas,
  writeGeneratedFile,
} from "@xndrjs/contentful-to-zod";
```

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

Overrides are inlined into the generated file at codegen time — the config is not imported at runtime.

## Mapping your data

Generated schemas describe **field values as defined in CMA** (e.g. Symbol → `string`, Link → Contentful link object). Mapping from Delivery/REST responses to those shapes is your responsibility — see the generated types and validate after mapping.

## xndrjs recipe (optional)

```ts
import { domain, zodToValidator } from "@xndrjs/domain-zod";
import { BlogPostSchema } from "./generated/contentful.schemas";

export const BlogPost = domain.shape("BlogPost", zodToValidator(BlogPostSchema));
```

## Status

Early scaffold — fetch, codegen, CLI, and tests are tracked in the implementation plan.
