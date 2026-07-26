---
title: Application resources
description: The @xndrjs/application-resources package — framework-agnostic resource identifiers for the application layer.
---

`@xndrjs/application-resources` models **Application Resource Identifiers** (ARIs): small, stable values that name _what_ became stale in your app — without importing cache libraries, UI frameworks, HTTP clients, or other infrastructure.

Use them when different parts of the app need to refer to the same logical resource — loaders, invalidators, logs, events — without each layer inventing its own tuple or string.

Every layer of the application should refer to the same resource using the same identifier.

For motivation and layer boundaries, see [From Query Keys to Application Resource Identifiers](/blog/from-query-keys-to-application-resource-identifiers/).

## Where it fits

| Layer              | Responsibility                                                                          |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Application**    | Define resource factories, use cases, and ports such as `ResourceInvalidator`           |
| **Infrastructure** | Implement invalidation adapters (client cache, SSR store, …) using `resource.toArray()` |

`@xndrjs/application-resources` belongs in the **application layer**. It has zero runtime dependencies and no opinion about how stale data is refreshed.

## Installation

```bash
pnpm add @xndrjs/application-resources
```

## Concepts

An ARI has:

- **`type`** — a stable string literal for the resource family (`"post-comments"`, `"post-list"`, …);
- **`key`** — a readonly array of structural parts that identify a specific instance or scope;
- **`toArray()`** — returns `[type, ...key]` for adapters;
- **`format(formatter?)`** — stable string representation (logging, debugging);
- **`equals(other)`** — structural equality via the same stable serialization.

`type` and `key` stay separate in the public model. Create resources with `ari(type, ...keyParts)`; the collapsed `[type, ...key]` shape is exposed only through `toArray()`.

## Defining resources

Use factory functions in application code and the `ari` helper:

```ts
import { ari } from "@xndrjs/application-resources";

export const postCommentsResource = (params: { postId: string; authorId: string }) =>
  ari("post-comments", params);

export const postListResource = (params: { blogId: string }) => ari("post-list", params);
```

Collect return types once for ports and invalidation:

```ts
export type CoreResourceIdentifier =
  | ReturnType<typeof postCommentsResource>
  | ReturnType<typeof postListResource>;
```

### Allowed key parts

Each key part may be:

- a serializable primitive: `string`, `number`, `boolean`, `null`;
- a simple object whose values are only those primitives (no nesting).

Not allowed: `undefined`, nested arrays, nested objects, functions, symbols, `Date`, `Map`, `Set`, class instances.

Normalize optional values to `null` or an explicit wildcard instead of leaving them `undefined`.

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
      postCommentsResource({
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

When an adapter needs a wider cache match (for example an open dimension represented as `null` in a canonical key), project with `omitNullKeyFields(resource.toArray())` — that policy belongs in the adapter, not in the resource factory. The package does not depend on TanStack Query.

## API

Exported symbols:

- **`ari`**
- **`omitNullKeyFields`**
- **`ApplicationResourceIdentifier`**
- **`ApplicationResourceKey`**
- **`ApplicationResourceKeyPart`**
- **`ApplicationResourcePrimitive`**
- **`ApplicationResourceKeyObject`**
- **`ApplicationResourceKeyFormatter`**
