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

- **`type`** — a stable string literal for the resource family (`"task-permissions"`, `"task-list"`, …);
- **`key`** — a readonly array of structural parts that identify a specific instance or scope;
- **`toArray()`** — returns `[type, ...key]` for adapters;
- **`format(formatter?)`** — stable string representation (logging, debugging);
- **`equals(other)`** — structural equality via the same stable serialization.

`type` and `key` stay separate in the public model. The collapsed `[type, ...key]` shape is exposed only through `toArray()`.

## Defining resources

Use factory functions in application code and the `ari` helper:

```ts
import { ari } from "@xndrjs/application-resources";

export const taskPermissionsResource = (params: { taskId: string; userId?: string }) =>
  ari("task-permissions", [
    {
      taskId: params.taskId,
      userId: params.userId ?? null,
    },
  ] as const);

export const taskListResource = (params: { projectId: string }) =>
  ari("task-list", [{ projectId: params.projectId }] as const);
```

Collect return types once for ports and invalidation:

```ts
export type CoreResourceIdentifier =
  | ReturnType<typeof taskPermissionsResource>
  | ReturnType<typeof taskListResource>;
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

export interface TaskPermissions {
  update(command: UpdateTaskPermissionCommand): Promise<void>;
}
```

The use case stays focused on application logic:

```ts
export class UpdateTaskPermission {
  constructor(private readonly permissions: TaskPermissions) {}

  async execute(command: UpdateTaskPermissionCommand) {
    await this.permissions.update(command);
  }
}
```

## Infrastructure adapters

An adapter performs the write and may invalidate affected resources — without the use case knowing how:

```ts
export class HttpTaskPermissionsAdapter implements TaskPermissions {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly invalidator: ResourceInvalidator
  ) {}

  async update(command: UpdateTaskPermissionCommand) {
    await this.httpClient.post("/task-permissions", command);

    await this.invalidator.invalidate([
      taskPermissionsResource({
        taskId: command.taskId,
        userId: command.userId,
      }),
    ]);
  }
}
```

A separate adapter translates resources into whatever cache runtime you use. Keep the ARI canonical (optional dimensions as `null`); apply projections like `omitNullKeyFields` in the invalidator when the cache needs a wider match:

```ts
import { omitNullKeyFields } from "@xndrjs/application-resources";

export class TanStackResourceInvalidator implements ResourceInvalidator {
  constructor(private readonly queryClient: QueryClient) {}

  async invalidate(resources: CoreResourceIdentifier[]) {
    await Promise.all(
      resources.map((resource) =>
        this.queryClient.invalidateQueries({
          queryKey: omitNullKeyFields(resource.toArray()),
        })
      )
    );
  }
}
```

`omitNullKeyFields` works on `resource.toArray()`, not on the ARI itself — so factories stay `ari(...)` with explicit `null`, and stripping remains an adapter concern. The package does not depend on TanStack Query.

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

See [API surface](/v0/reference/api-surface/#xndrjsapplication-resources) for a compact import map.
