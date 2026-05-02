# @xndrjs/tasks

Lazy asynchronous **tasks**: effects run only when awaited or chained like a `Promise`, with optional **retry** and predictable composability, mostly for infrastructure code.

## Installation

```bash
npm install @xndrjs/tasks
```

## Concepts

- **`task(effect)`** — wraps `effect: () => Promise<T>`. Each `await` or `.then`/`.catch`/`.finally` invokes the effect again unless you memoize externally or use **`.inflightDedup`**.
- **`.retry(shouldRetry, options?)`** — runs the underlying effect up to **`maxAttempts`** times (including the first try). **`shouldRetry(error, attempt)`** is async-friendly (e.g. backoff inside the predicate). Default **`maxAttempts`** is **3**; **`maxAttempts`** must be an integer ≥ 1. **At most one** `.retry()` per chain.
- **`.inflightDedup(key, registry?)`** — **`key`** must be a **`symbol`**. Concurrent consumers using the **same** `key` in the **same** `InflightRegistry` share **one** in-flight run of the current effect (if you used `.retry`, the shared run is the **whole** retry sequence). **At most one** `.inflightDedup()` per chain. When that run settles, the slot is cleared. Omit **`registry`** to use the package default (process-wide); pass **`createInflightRegistry()`** to scope slots (tests, isolation).

### Allowed shapes

1. **`task(effect)`** only
2. **`task(effect).retry(...)`** (no dedup)
3. **`task(effect).inflightDedup(...)`** (no retry)
4. **`task(effect).retry(...).inflightDedup(...)`** — retry **before** dedup

You cannot call `.retry` after `.inflightDedup`, chain two `.retry`, or chain two `.inflightDedup` (enforced by TypeScript).

### Choosing a dedup key

- **Private logical operation** (no accidental cross-package collisions): one module-level binding, e.g. `const loadUsersOp = Symbol("loadUsers")`. Each call to `Symbol("loadUsers")` without reusing the binding would create a _different_ symbol; keep a single `const` and import it where needed.
- **Intentional global agreement** (same slot for everyone using that name): `Symbol.for("MY_APP:loadUsers")` — the runtime registry is shared; only use when overlaps are desired.

### Registry

- **`createInflightRegistry()`** — returns a fresh `Map`-compatible store. Use when tests or subsystems must not share in-flight state with the rest of the process.

## Example

```ts
import { sleep, task } from "@xndrjs/tasks";

const loadUsers = Symbol("loadUsers");

const usersTask = task(async () => fetch("/api/users"))
  .retry(
    async (error, attempt) => {
      if (!shouldRetry(error)) return false;

      // `attempt` starts at 0 after the first failure.
      // Wait: 200ms, 400ms, 800ms, 1600ms...
      const delayMs = 200 * 2 ** attempt;
      await sleep(delayMs);

      return true; // retry after sleep
    },
    {
      maxAttempts: 5,
    }
  )
  .inflightDedup(loadUsers)
  .then((response) => response.json());

const users = await usersTask;
```

## API

Exported symbols: **`task`**, **`sleep`**, **`Task`**, **`TaskAfterRetry`**, **`TaskFinal`**, **`TaskPromise`**, **`InflightRegistry`**, **`createInflightRegistry`**, **`RetryPredicate`**, **`RetryOptions`** (`maxAttempts?: number`).

## Caveats

- Tasks are lazy and re-executed on each await/then; use **`.inflightDedup`** for in-flight coalescing, or memoize externally for other caching needs.
- `retry` does not classify errors for you: domain-specific retry rules should live in `shouldRetry`.

## License

MIT
