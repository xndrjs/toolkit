# @xndrjs/tasks

Lazy asynchronous **tasks**: effects run only when awaited or chained like a `Promise`, with optional **retry** and predictable composability for infrastructure code.

## Installation

```bash
npm install @xndrjs/tasks
```

## Concepts

- **`task(effect)`** — wraps `effect: () => Promise<T>`. Each `await` or `.then`/`.catch`/`.finally` invokes the effect again unless you memoize externally.
- **`.retry(shouldRetry, options?)`** — runs the underlying effect up to **`maxAttempts`** times (including the first try). **`shouldRetry(error, attempt)`** is async-friendly (e.g. backoff inside the predicate). Default **`maxAttempts`** is **3**; **`maxAttempts`** must be an integer ≥ 1.

## Example

```ts
import { task } from "@xndrjs/tasks";

const t = task(() => fetch("/api/users").then((r) => r.json())).retry(() => true, {
  maxAttempts: 5,
});

await t;
```

## API

Exported symbols: **`task`**, **`Task`**, **`RetryPredicate`**, **`RetryOptions`** (`maxAttempts?: number`).
