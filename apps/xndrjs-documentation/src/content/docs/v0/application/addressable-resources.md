---
title: Addressable resources
description: The @xndrjs/addressable-resources package — framework-agnostic resource identifiers for the application layer.
---

`@xndrjs/addressable-resources` models **Addressable Resource Identifiers** (ARIs): small, stable values that name _what_ became stale in your app — without importing cache libraries, UI frameworks, HTTP clients, or other infrastructure.

Use them when different parts of the app need to refer to the same logical resource — loaders, invalidators, logs, events — without each layer inventing its own tuple or string.

Every layer of the application should refer to the same resource using the same identifier.

For motivation and layer boundaries, see [From Query Keys to Addressable Resource Identifiers](/blog/from-query-keys-to-addressable-resource-identifiers/).

:::note[Package rename]

`@xndrjs/application-resources` is succeeded by `@xndrjs/addressable-resources`. Deprecate the old package on npm yourself (`npm deprecate …`); do not unpublish. There is no re-export shim under the old name.

:::

## Where it fits

| Layer              | Responsibility                                                                          |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Application**    | Define resource factories, use cases, and ports such as `ResourceInvalidator`           |
| **Infrastructure** | Implement invalidation adapters (client cache, SSR store, …) using `resource.toArray()` |

`@xndrjs/addressable-resources` belongs in the **application layer**. It has zero runtime dependencies and no opinion about how stale data is refreshed.

## Installation

```bash
pnpm add @xndrjs/addressable-resources
```

## Concepts

An ARI has:

- **`type`** — a stable string naming the resource family (may contain dots; must not contain `(` / `)`);
- **`key`** — a frozen flat object that identifies a specific instance;
- **`toArray()`** — returns `[type, key]` for external adapters (for example TanStack Query);
- **`toString()`** — canonical stable identity string (map keys, cache, dedup, logs);
- **`equals(other)`** — structural equality via the same stable serialization.

Define typed resource families with **`ari(type, objectSchema)`** and the key-schema DSL **`s`**. Each factory validates keys on create, exposes **`matches`**, and can **`parseString`** / **`safeParseString`** round-trip instances from `toString()` output.

## Defining resources

```ts
import { ari, s } from "@xndrjs/addressable-resources";

export const postCommentsAri = ari(
  "post-comments",
  s.object({ postId: s.string(), authorId: s.string() })
);

export const postListAri = ari("post-list", s.object({ blogId: s.string() }));
```

Collect return types once for ports and invalidation:

```ts
export type CoreResourceIdentifier =
  | ReturnType<typeof postCommentsAri>
  | ReturnType<typeof postListAri>;
```

Factory helpers:

- **`matches(candidate)`** — type guard when dispatching on an untyped ARI;
- **`parseString(formatted)`** — rebuild from `toString()` output (throws on invalid input);
- **`safeParseString(formatted)`** — same round-trip with structured `{ success, value }` or `{ success, issues }`.

### Canonical identity string

`toString()` returns `Type(field=value,field=value,...)` with **lexicographic** field order and JSON scalar encoding (`"str"`, `42`, `true`, `null`):

```ts
const resource = postCommentsAri({ postId: "p1", authorId: "a1" });

resource.toString();
// post-comments(authorId="a1",postId="p1")

postCommentsAri.parseString(resource.toString()).equals(resource); // true

const parsed = postCommentsAri.safeParseString(resource.toString());
if (parsed.success) {
  parsed.value; // AddressableResourceIdentifier
}
```

`Thing(id="42")` and `Thing(id=42)` are distinct identities.

For untyped parse/build (for example log replay or generic caches), use **`formatAriString`**, **`parseAriString`**, and **`safeParseAriString`**.

### Allowed keys

The identity key is a flat object whose values may be:

- a serializable primitive: `string`, `number`, `boolean`, `null`.

Not allowed:

- `undefined`;
- nested arrays or objects;
- functions, symbols, `Date`, `Map`, `Set`, class instances;
- multi-segment / tuple keys.

Normalize optional values to `null` or an explicit wildcard instead of leaving them `undefined`. Access fields as `resource.key.postId` — not `resource.key[0]`.

`ari` requires exactly one `s.object({...})` identity schema. Key schema builders (`s`): `string`, `int`, `boolean`, `nullable`, `optional`, `literal`, `enum`, `object` (flat), plus `union` when you need alternate locator shapes for `safeParse`.

## Invalidation port

Keep use cases free of cache imports. Declare a narrow port in the application layer:

```ts
export interface ResourceInvalidator {
  invalidate(resources: CoreResourceIdentifier[]): Promise<void>;
}

export interface PostCommentsPort {
  update(command: UpdatePostCommentCommand): Promise<void>;
}
```

The use case stays focused on application logic:

```ts
export class UpdatePostComment {
  constructor(private readonly comments: PostCommentsPort) {}

  async execute(command: UpdatePostCommentCommand) {
    await this.comments.update(command);
  }
}
```

## Infrastructure adapters

An adapter performs the write and may invalidate affected resources — without the use case knowing how:

```ts
export class HttpPostCommentsAdapter implements PostCommentsPort {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly invalidator: ResourceInvalidator
  ) {}

  async update(command: UpdatePostCommentCommand) {
    await this.httpClient.post("/post-comments", command);

    await this.invalidator.invalidate([
      postCommentsAri({
        postId: command.postId,
        authorId: command.authorId,
      }),
    ]);
  }
}
```

A separate adapter translates resources into whatever cache runtime you use:

```ts
export class TanStackResourceInvalidator implements ResourceInvalidator {
  constructor(private readonly queryClient: QueryClient) {}

  async invalidate(resources: CoreResourceIdentifier[]) {
    await Promise.all(
      resources.map((resource) =>
        this.queryClient.invalidateQueries({
          queryKey: resource.toArray(),
        })
      )
    );
  }
}
```

`resource.toArray()` is `[type, keyObject]`. When an adapter needs a wider cache match (for example an open dimension represented as `null` in a canonical key), project with `omitNullKeyFields(resource.toArray())` — that policy belongs in the adapter, not in the resource factory. The package does not depend on TanStack Query.

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
