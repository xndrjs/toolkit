---
title: Ports, data, tasks
description: How the non-domain xndrjs packages fit into application architecture.
---

The domain packages model trust and meaning. The other `xndrjs` packages support application flow around that model.

They are intentionally small. They do not impose an application framework.

## Orchestration ports

`@xndrjs/orchestration` provides interfaces for application and presentation boundaries.

The main exported port is `AsyncDataInteractionPort<Data, Err>`, used to drive a single asynchronous slice of UI state:

```ts
import type { AsyncDataInteractionPort } from "@xndrjs/orchestration";

interface InvoiceScreenPort {
  document: AsyncDataInteractionPort<DocumentDTO>;
  invoice: AsyncDataInteractionPort<InvoiceDTO>;
  onInvoiceValidated: () => void;
}
```

Use cases can depend on these ports instead of depending directly on React, a store, or a specific view implementation.

## React adapter

`@xndrjs/react-adapter` implements orchestration ports as React hooks.

```tsx
import { useEffect } from "react";
import { useAsyncData } from "@xndrjs/react-adapter";

function Panel() {
  const { data, isLoading, error, port } = useAsyncData({ items: [] });

  useEffect(() => {
    void loadItems(port);
  }, [port]);

  return null;
}
```

The hook is deliberately thin. Application rules still belong in use cases, not in components.

## Data layer utilities

`@xndrjs/data-layer` provides utilities for request-scoped batch loading.

### mapBatchToIds

Use `mapBatchToIds` to align unordered batch results with requested ids:

```ts
import { mapBatchToIds } from "@xndrjs/data-layer";

const ordered = mapBatchToIds(["a", "b", "c"], unorderedRowsFromDb, (row) => row.id);
```

Missing ids produce errors, and duplicate result keys keep the last occurrence.

### createDataLoaderRegistry

Use `createDataLoaderRegistry` to create request-scoped DataLoader instances:

```ts
import DataLoader from "dataloader";
import { createDataLoaderRegistry } from "@xndrjs/data-layer";

const registry = createDataLoaderRegistry();

const users = registry.getOrCreate("users", () => new DataLoader<string, User>(batchLoadUsers));
```

The registry lifecycle is controlled by your application. Request-scoped is usually the safest default.

## Tasks

`@xndrjs/tasks` provides lazy asynchronous tasks with optional retry.

```ts
import { sleep, task } from "@xndrjs/tasks";

const usersTask = task(async () => fetch("/api/users"))
  .retry(
    async (error, attempt) => {
      if (!shouldRetry(error)) return false;

      await sleep(200 * 2 ** attempt);
      return true;
    },
    { maxAttempts: 5 }
  )
  .then((response) => response.json());

const users = await usersTask;
```

Tasks are lazy and re-execute on each `await`, `.then`, `.catch`, or `.finally` unless you memoize externally.

## Architectural placement

A typical flow looks like this:

```text
UI adapter
  -> orchestration port
  -> use case
  -> domain kits
  -> data layer or task
  -> external system
```

The packages are small on purpose. They provide vocabulary and constraints without taking over the architecture.
