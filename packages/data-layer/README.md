# @xndrjs/data-layer

Utilities for **batch loading**, **DataLoader registries**, and aligning unordered batch results with requested ids—typical building blocks for a data-fetching layer.

## Installation

```bash
npm install @xndrjs/data-layer dataloader
```

**Peer dependency:** **`dataloader` ^2.2.0** (install it in your app; the package does not re-export `DataLoader`).

## `mapBatchToIds`

Reorders **`results`** to match **`requestedIds`**, using **`keySelector`** for each row. Missing ids yield **`notFoundFactory(id)`** (optional); default message is `Resource <id> not found`. Duplicate keys in **`results`** keep the **last** occurrence.

Return type is **`(V | E)[]`** with **`E extends Error`** when you pass a typed **`notFoundFactory`**.

```ts
import { mapBatchToIds } from "@xndrjs/data-layer";

const ordered = mapBatchToIds(["a", "b", "c"], unorderedRowsFromDb, (row) => row.id);
```

## `createDataLoaderRegistry`

Request-scoped (or similarly scoped) registry: **`getOrCreate(key, factory)`** returns the same **`DataLoader`** instance for a given string **`key`**, creating it once via **`factory`**.

```ts
import type DataLoader from "dataloader";
import { createDataLoaderRegistry } from "@xndrjs/data-layer";

const registry = createDataLoaderRegistry();

const users = registry.getOrCreate("users", () => new DataLoader<string, User>(batchLoadUsers));
```

Import **`DataLoader`** from **`"dataloader"`** in application code.

## Caveats

- `mapBatchToIds` keeps the last duplicate key from batch results; ensure this matches your domain expectation.
- Registry lifecycle is up to the caller (request-scoped registry is usually the safest default).

## License

MIT
