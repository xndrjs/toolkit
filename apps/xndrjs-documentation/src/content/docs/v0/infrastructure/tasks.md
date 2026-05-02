---
title: Tasks
description: The @xndrjs/tasks package — lazy async work, retry, and in-flight deduplication.
---

`@xndrjs/tasks` is a small promise-like abstraction for lazy asynchronous work. It combines two optional layers you can turn on in the fluent builder:

- **Retry** (`.retry`): re-run the effect after failure according to rules you define.
- **In-flight deduplication** (`.inflightDedup`): while an execution is already in progress, additional consumers that share the same **key** (and optional registry) **join** that run instead of starting another—until it settles (success or final failure after retries, if any).

Unlike an eager Promise, a task does not run when it is created. It runs when awaited or consumed, and stays easy to compose with standard async code (`.then`, `await`, etc.).

`@xndrjs/tasks` is primarily designed for **technical retry handling**, which makes it a natural fit for the infrastructure layer.

Most retries in real systems are not business decisions, but responses to transient failures such as network errors, timeouts, or temporarily unavailable services. These concerns are often handled in an ad-hoc way, leading to duplicated logic, inconsistent behavior, or simply being overlooked.

Tasks provide a small, focused abstraction to make this consistent and explicit. Instead of scattering retry logic across the codebase, you define it once as part of the task itself, with clear and configurable policies.

Nothing prevents using tasks for application-level retries when they have semantic meaning. However, their primary goal is to standardize technical retry handling and remove the need for repetitive boilerplate or “extra thought” at every call site.

As with other `xndrjs` packages, the idea is to make best practices the **path of least resistance**:

```
retry is easy to remember + retry is easy to configure

=> retry is consistently applied

```

By turning retry into a first-class primitive, tasks help ensure that resilience is not something you have to remember, but something built into how your system works.

## Working with tasks

The fluent builder is optional: use **`task(fn)`** alone, add **`.retry(...)`**, add **`.inflightDedup(key, registry?)`**, or chain **`.retry` then `.inflightDedup`** when you need both (retry runs **inside** the deduplicated work—see Composition below).

Example with **retry** only:

```ts
import { sleep, task } from "@xndrjs/tasks";

const usersTask = task(async () => fetch("/api/users"))
  .retry(
    async (error, attempt) => {
      // define custom condition (i.e. retry only on 429)
      if (!shouldRetry(error)) return false;

      // handle custom back-off (i.e. exponential)
      await sleep(200 * 2 ** attempt);

      // return whether to try again or not
      return true;
    },
    { maxAttempts: 5 } // shortcut to handle max attempts count
  )
  // from here on, it's a standard Promise (use .then, .catch, .finally)
  .then((response) => response.json());

const users = await usersTask; // now the task is actually run
```

Tasks are **lazy** and **re-execute on each consumption** unless **in-flight dedup** applies: every `await` (or equivalent) starts the effect again for a plain `task` or `task().retry` chain.

**Composition:** **`task()`**, **`task().retry()`**, **`task().inflightDedup()`**, or **`task().retry().inflightDedup()`** — when both appear, **retry always comes before** dedup. A second `.retry` or `.inflightDedup` on the same chain is not allowed (the types prevent it).

### In-flight dedup in practice

Add **`.inflightDedup(key, registry?)`** when **overlapping** awaits should share **one** in-flight run (including the full **`.retry`** sequence if you chained `.retry` first) until that run settles. **`key` is always a `symbol`**. Omit **`registry`** for the package default store, or pass **`createInflightRegistry()`** from `@xndrjs/tasks` to scope coalescing (tests, isolation).

**Keys:** use a **single module-level binding** such as `const loadUsers = Symbol("loadUsers")` so unrelated features never collide by accident. Use **`Symbol.for("MY_APP:loadUsers")`** only when you **intentionally** want the same runtime-wide slot for everyone who agrees on that string.

**Same task instance:** coalescing is keyed by `symbol` + registry; reuse the **same** task value (e.g. a shared `const usersTask = …`) wherever nested flow code should join the same in-flight work. Building **`task(…).inflightDedup(key)`** on the fly in two branches creates **two** task objects; they still coalesce if they share the **same** `key` and **registry** (default or explicit).

Without dedup, two sequential awaits mean two loads:

```ts
const usersTask = task(async () => fetch("/api/users"))
  .retry(() => true, { maxAttempts: 3 })
  .then((response) => response.json());

const users1 = await usersTask; // runs fetch (+ retries if needed)
const users2 = await usersTask; // runs again
```

With **inflightDedup**, two consumers that overlap in time share a single in-flight run:

```ts
import { task } from "@xndrjs/tasks";

const loadUsersKey = Symbol("loadUsers");

const usersTask = task(async () => fetch("/api/users"))
  .retry(() => true, { maxAttempts: 3 })
  .inflightDedup(loadUsersKey)
  .then((response) => response.json());

// one fetch for both waiters
const [a, b] = await Promise.all([usersTask, usersTask]);
```
