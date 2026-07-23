# @xndrjs/application-resources

Framework-agnostic **Application Resource Identifiers** for the core/application layer: stable, structural resource IDs you can use for stale resources, invalidation, logging, or later conversion to cache/query keys — without depending on any infrastructure details.

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

`type` and `key` stay separate in the public model. The collapsed `[type, ...key]` shape is exposed only through `toArray()`.

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

## Example

```ts
import { ari } from "@xndrjs/application-resources";

export const taskPermissionsResource = (params: { taskId: string; userId?: string }) =>
  ari("task-permissions", [
    {
      taskId: params.taskId,
      userId: params.userId ?? null,
    },
  ] as const);

const resource = taskPermissionsResource({
  taskId: "task-123",
  userId: "user-456",
});

resource.type;
// "task-permissions"

resource.key;
// [{ taskId: "task-123", userId: "user-456" }]

resource.toArray();
// ["task-permissions", { taskId: "task-123", userId: "user-456" }]

resource.format();
// stable string representation
```

## TanStack Query (external)

This package does not depend on TanStack Query. In your infrastructure layer, pass `resource.toArray()` directly as the query key:

```ts
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

await queryClient.invalidateQueries({
  queryKey: taskPermissionsResource({
    taskId: command.taskId,
    userId: command.userId,
  }).toArray(),
});
```

## Clean Architecture

Define resource factories in the core/application layer and type your invalidation port against their return types:

```ts
export type TasksResourceIdentifier =
  | ReturnType<typeof taskPermissionsResource>
  | ReturnType<typeof taskResource>;

export interface ResourceInvalidator {
  invalidate(resources: TasksResourceIdentifier[]): Promise<void>;
}
```

A driven adapter can receive `ResourceInvalidator` via dependency injection:

```ts
export class HttpTaskPermissionRepository {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly resourceInvalidator: ResourceInvalidator
  ) {}

  async updatePermission(command: UpdateTaskPermissionCommand) {
    const result = await this.httpClient.post("/task-permissions", command);

    await this.resourceInvalidator.invalidate([
      taskPermissionsResource({
        taskId: command.taskId,
        userId: command.userId,
      }),
    ]);

    return result;
  }
}
```

## API

Exported symbols:

- **`ari`**
- **`ApplicationResourceIdentifier`**
- **`ApplicationResourceKey`**
- **`ApplicationResourceKeyPart`**
- **`ApplicationResourcePrimitive`**
- **`ApplicationResourceKeyObject`**
- **`ApplicationResourceKeyFormatter`**

## License

MIT
