# @xndrjs/application-resources

Framework-agnostic **Application Resource Identifiers**: stable, structural resource IDs you can use for stale resources, invalidation, logging, or later conversion to cache/query keys.

## Installation

```bash
npm install @xndrjs/application-resources
```

## Concepts

An **Application Resource Identifier** (ARI) has:

- **`type`** — a stable string literal naming the resource family;
- **`key`** — a readonly array of structural parts that identify a specific instance/scope;
- **`toArray()`** — returns `[type, ...key]` for external adapters (for example TanStack Query);
- **`format(formatter?)`** — returns a stable string representation;
- **`equals(other)`** — compares two resources using the same stable serialization.

`type` names the **resource family**; `key` holds the **coordinates** (instance id, filter, or empty family scope). Create resources with `ari(type, ...keyParts)` for ad-hoc keys, or **`defineAri(type, ...keyPartSchemas)`** when you want validated locators and `matches` for dispatch.

### Allowed key parts

Each key part may be:

- a serializable primitive: `string`, `number`, `boolean`, `null`;
- a simple readonly object whose values are only those primitives (no nesting).

Not allowed:

- `undefined`;
- nested arrays inside the key;
- nested objects;
- functions, symbols, `Date`, `Map`, `Set`, class instances.

Normalize optional values to `null` or an explicit wildcard instead of leaving them `undefined`.

## `defineAri` (recommended for typed families)

```ts
import { defineAri, s } from "@xndrjs/application-resources";

export const integrationProductAri = defineAri(
  "integration.product",
  s.object({ sku: s.string() })
);

const resource = integrationProductAri({ sku: "TSHIRT-1" });

integrationProductAri.matches(resource); // type + key shape
integrationProductAri.type; // "integration.product"
```

Key part schemas are wrapped in a tuple automatically (`defineAri("posts")` → empty key). Key schema builders (`s`): `string`, `int`, `boolean`, `nullable`, `optional`, `literal`, `enum`, `object` (flat), plus `tuple` / `union` when you need them explicitly. No Zod dependency — intentionally small.

`ari()` remains available as a low-level constructor without a key schema.

## Example (`ari`)

```ts
import { ari } from "@xndrjs/application-resources";

export const postCommentsResource = (params: { postId: string; authorId: string }) =>
  ari("post-comments", params);

const resource = postCommentsResource({
  postId: "post-123",
  authorId: "author-456",
});

resource.type;
// "post-comments"

resource.key;
// [{ postId: "post-123", authorId: "author-456" }]

resource.toArray();
// ["post-comments", { postId: "post-123", authorId: "author-456" }]

resource.format();
// stable string representation
```

## TanStack Query (external)

This package does not depend on TanStack Query. Use `resource.toArray()` as the query key. When an adapter needs a wider cache match (open dimensions as `null` in a canonical key), project with `omitNullKeyFields`:

```ts
import { omitNullKeyFields } from "@xndrjs/application-resources";
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

const resource = postCommentsResource({
  postId: command.postId,
  authorId: command.authorId,
});

await queryClient.invalidateQueries({
  queryKey: resource.toArray(),
});

// wider match when a key object contains null open dimensions:
await queryClient.invalidateQueries({
  queryKey: omitNullKeyFields(resource.toArray()),
});
```

## Clean Architecture

Define resource factories in the core/application layer and type your invalidation port against their return types:

```ts
export type PostsResourceIdentifier =
  | ReturnType<typeof postCommentsResource>
  | ReturnType<typeof postResource>;

export interface ResourceInvalidator {
  invalidate(resources: PostsResourceIdentifier[]): Promise<void>;
}
```

A driven adapter can receive `ResourceInvalidator` via dependency injection and apply cache-specific projections there — not inside use cases or resource factories:

```ts
export class HttpPostCommentsAdapter {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly resourceInvalidator: ResourceInvalidator
  ) {}

  async updateComment(command: UpdatePostCommentCommand) {
    const result = await this.httpClient.post("/post-comments", command);

    await this.resourceInvalidator.invalidate([
      postCommentsResource({
        postId: command.postId,
        authorId: command.authorId,
      }),
    ]);

    return result;
  }
}
```

## API

Exported symbols:

- **`ari`**
- **`defineAri`** / **`AriKeySchemaError`** / **`DefinedAri`**
- **`s`** / **`safeParse`** / **`InferKeySchema`**
- **`omitNullKeyFields`**
- **`ApplicationResourceIdentifier`**
- **`ApplicationResourceKey`**
- **`ApplicationResourceKeyPart`**
- **`ApplicationResourcePrimitive`**
- **`ApplicationResourceKeyObject`**
- **`ApplicationResourceKeyFormatter`**

## License

MIT
