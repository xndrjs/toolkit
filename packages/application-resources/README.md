# @xndrjs/application-resources

Framework-agnostic **Application Resource Identifiers**: stable, structural resource IDs you can use for stale resources, invalidation, logging, cache keys, or later conversion to vendor-specific storage keys.

## Installation

```bash
npm install @xndrjs/application-resources
```

## Concepts

An **Application Resource Identifier** (ARI) has:

- **`type`** — a stable string literal naming the resource family;
- **`key`** — a readonly array of structural parts that identify a specific instance/scope;
- **`toArray()`** — returns `[type, ...key]` for external adapters (for example TanStack Query);
- **`toString()`** — canonical stable identity string (map keys, cache, dedup, logs);
- **`equals(other)`** — structural equality via the same stable serialization.

Define typed resource families with **`ari(type, ...keyPartSchemas)`** and the key-schema DSL **`s`**. Each factory validates keys on create, exposes **`matches`**, and can **`parseString`** / **`safeParseString`** round-trip instances from `toString()` output.

### Stable identity string

`toString()` returns `"<type>":<json-key-array>` — use it for map keys, cache, dedup, and logs:

```ts
postCommentsAri.parseString(resource.toString());
postCommentsAri.safeParseString(wire); // { success, value } | { success, issues }
```

Untyped helpers: **`stableStringifyResource`**, **`parseStableStringifyResource`**, **`safeParseStableStringifyResource`**.

**Migration:** `defineAri` → **`ari`**, **`format()`** → **`toString()`**.

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

## Defining resources

```ts
import { ari, s } from "@xndrjs/application-resources";

export const postCommentsAri = ari(
  "post-comments",
  s.object({ postId: s.string(), authorId: s.string() })
);

const resource = postCommentsAri({
  postId: "post-123",
  authorId: "author-456",
});

postCommentsAri.matches(resource); // type + key shape
postCommentsAri.parseString(resource.toString()); // round-trip
resource.toString(); // canonical identity string
```

Key part schemas are wrapped in a tuple automatically (`ari("posts")` → empty key). Key schema builders (`s`): `string`, `int`, `boolean`, `nullable`, `optional`, `literal`, `enum`, `object` (flat), plus `tuple` / `union` when you need them explicitly. No Zod dependency — intentionally small.

## TanStack Query (external)

This package does not depend on TanStack Query. Use `resource.toArray()` as the query key. When an adapter needs a wider cache match (open dimensions as `null` in a canonical key), project with `omitNullKeyFields`:

```ts
import { omitNullKeyFields } from "@xndrjs/application-resources";
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

const resource = postCommentsAri({
  postId: command.postId,
  authorId: command.authorId,
});

await queryClient.invalidateQueries({
  queryKey: resource.toArray(),
});

await queryClient.invalidateQueries({
  queryKey: omitNullKeyFields(resource.toArray()),
});
```

## Clean Architecture

Define resource factories in the core/application layer and type your invalidation port against their return types:

```ts
export type PostsResourceIdentifier = ReturnType<typeof postCommentsAri>;

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
      postCommentsAri({
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

- **`ari`** / **`AriFactory`** / **`AriKeySchemaError`** / **`AriParseError`**
- **`s`** / **`safeParse`** / **`InferKeySchema`**
- **`parseString`** / **`safeParseString`** on factories
- **`stableStringifyResource`** / **`parseStableStringifyResource`** / **`safeParseStableStringifyResource`**
- **`omitNullKeyFields`**
- **`ApplicationResourceIdentifier`**
- **`ApplicationResourceKey`**
- **`ApplicationResourceKeyPart`**
- **`ApplicationResourcePrimitive`**
- **`ApplicationResourceKeyObject`**

## License

MIT
