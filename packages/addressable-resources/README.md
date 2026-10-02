# @xndrjs/addressable-resources

Framework-agnostic **Addressable Resource Identifiers** (ARI): stable, structural resource IDs for stale resources, invalidation, logging, cache keys, or conversion to vendor-specific storage keys.

## Installation

```bash
npm install @xndrjs/addressable-resources
```

## Concepts

An **Addressable Resource Identifier** (ARI) has:

- **`type`** — a stable string naming the resource family (may contain dots; must not contain `(` / `)`);
- **`key`** — a frozen flat object that identifies a specific instance;
- **`toArray()`** — returns `[type, key]` for external adapters (for example TanStack Query);
- **`toString()`** — canonical stable identity string (map keys, cache, dedup, logs);
- **`equals(other)`** — structural equality via the same stable serialization.

Define typed resource families with **`ari(type, objectSchema)`** and the key-schema DSL **`s`**. Each factory validates keys on create, exposes **`matches`**, and can **`parseString`** / **`safeParseString`** round-trip instances from `toString()` output.

### Canonical identity string

`toString()` returns `Type(field=value,field=value,...)` with **lexicographic** field order and JSON scalar encoding (`"str"`, `42`, `true`, `null`):

```ts
postCommentsAri.parseString(resource.toString());
postCommentsAri.safeParseString(wire); // { success, value } | { success, issues }
```

Untyped helpers: **`formatAriString`**, **`parseAriString`**, **`safeParseAriString`**.

`Thing(id="42")` and `Thing(id=42)` are distinct identities.

### Allowed keys

The identity key is a flat object whose values may be:

- a serializable primitive: `string`, `number`, `boolean`, `null`.

Not allowed:

- `undefined`;
- nested arrays or objects;
- functions, symbols, `Date`, `Map`, `Set`, class instances;
- multi-segment / tuple keys.

Normalize optional values to `null` or an explicit wildcard instead of leaving them `undefined`.

## Defining resources

```ts
import { ari, s } from "@xndrjs/addressable-resources";

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
resource.toString(); // e.g. post-comments(authorId="author-456",postId="post-123")
resource.key; // { postId, authorId } — not key[0]
```

`ari` requires exactly one `s.object({...})` identity schema. Key schema builders (`s`): `string`, `int`, `boolean`, `nullable`, `optional`, `literal`, `enum`, `object` (flat), plus `union` when you need alternate locator shapes for `safeParse`. No Zod dependency — intentionally small.

## TanStack Query (external)

This package does not depend on TanStack Query. Use `resource.toArray()` as the query key (`[type, keyObject]`). When an adapter needs a wider cache match (open dimensions as `null` in a canonical key), project with `omitNullKeyFields`:

```ts
import { omitNullKeyFields } from "@xndrjs/addressable-resources";
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

Define resource factories in domain or application code and type your invalidation port against their return types:

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
- **`formatAriString`** / **`parseAriString`** / **`safeParseAriString`**
- **`omitNullKeyFields`**
- **`AddressableResourceIdentifier`**
- **`AddressableResourceKey`**
- **`AddressableResourcePrimitive`**

## License

MIT
