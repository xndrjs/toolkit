# @xndrjs/forma

Intent-oriented composition for TypeScript: declare **boundaries** and **intents**, attach **providers**, and wire a closed graph with `compose`. The composition owns the public **surface**, lazy materialization, and execution-context lifetimes.

This package is a proof of concept. Vocabulary lives in [GLOSSARY.md](./GLOSSARY.md); design records live under [docs/adr/](./docs/adr/) (Adapter peer of Boundary; unified `wiring` registration; Intent alias / Adapter passthrough default; surface/`using` key hygiene; Design C execution API; execution params / `AbortSignal`; effective lifetime inference; Stream Intent modality / ownership — [ADR 0012](./docs/adr/0012-streaming-intents.md); Entry Boundary and Surface direction — [ADR 0013](./docs/adr/0013-entry-boundaries-and-surface-direction.md); optional `defineWiring` when extracting wiring).

## Installation

```bash
npm install @xndrjs/forma
```

## Quick start

### Boundary, Intent, contract

```ts
import { boundary, ok, type Result } from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

const Orders = boundary("orders");

export const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
export const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
```

Name first, then `.contract<Input, Success, Err>()` — TypeScript keeps the literal Intent name that way. `boundary.intent` is always **unary** (one terminal `Result`). For pull-based sequences use `boundary.stream` (below).

### Providers

`.with` takes a factory that returns the Intent operation as a `function` (sync or `async`). Prefer `ctx => function (…) { … }` over nested arrows. Destructure context only when you use it. `Lifetime.onDispose` is valid only during that materialization attempt — after the factory returns, the handle is sealed; on failure Forma rolls back local cleanups immediately and does not cache the attempt.

```ts
import { err, ok } from "@xndrjs/forma";

const FindProvider = FindOrder.provide.with(
  (_ctx) =>
    function (id) {
      return id.id === "42" ? ok({ id: "42", total: 100 }) : err({ kind: "not_found" as const });
    }
);

type ConnHandle = { close(): void };
async function openConnection(opts: { signal: AbortSignal }): Promise<ConnHandle> {
  opts.signal.throwIfAborted();
  return { close() {} };
}

const Conn = Orders.intent("conn").contract<void, ConnHandle, never>();
const ConnProvider = Conn.provide.perContext().with(async ({ lifetime }) => {
  const conn = await openConnection({ signal: lifetime.signal });
  lifetime.onDispose(() => conn.close());
  return function () {
    return ok(conn);
  };
});

type OrderParams = { readonly role: "admin" | "viewer" | "guest" };

const GetOrderProvider = GetOrder.provide
  .perContext<OrderParams>()
  .using({ find: FindOrder })
  .with(
    ({ deps: { find }, params }) =>
      function (id) {
        if (params.role === "guest") {
          return err({ kind: "not_found" as const });
        }
        return find(id);
      }
  );
```

Lifetime policy is local, while effective lifetime is derived from the resolved graph. No modifier means `auto`: the Provider is shared by the composition root unless any transitive dependency is context-owned, in which case it is narrowed to one instance per `openExecutionContext()` / `withExecutionContext()`. `.perContext()` forces context ownership; `.perComposition()` pins root ownership and makes `compose()` fail with the dependency path if a transitive dependency requires a context. `root.describePlan()` reports declared and effective lifetimes. Root and context `dispose()` are terminal state machines (concurrent callers share one promise); entering `disposing` aborts that owner’s `AbortSignal` (`lifetime.signal` / `execution.signal`). `root.dispose()` also closes any open execution contexts. Prefer `withExecutionContext` (or `await using` on the open handle) for short lexical scopes; use `openExecutionContext` when a host owns the lifetime across mount/unmount.

Typed execution **params**: declare a POJO on `.perContext<ParamsReq>()`. `compose({ … })` **infers** the required host bag from all such declarations (merge; conflicting key types fail at compose). open/with then require `{ params }` (shared `ExecutionContextArgs`). Factories read typed `params` on the `.with` context — not on `Lifetime`. `compose<Explicit>()({ … })` is only for an explicit **superset** of the inferred bag. An optional host `signal` on those args links into the context signal without transferring dispose ownership.

`Intent.provide.using` accepts only same-boundary Intents, is **one-shot** (do not chain `.using`), and requires string dependency keys. Surface aliases are likewise string-only; `dispose` and `surface` are reserved on the composition surface map (operations nest under `execution.surface`). Every Provider carries a required `origin` discriminant: `{ kind: "boundary", id }` from `Intent.provide…with`, or `{ kind: "adapter", id }` from Adapter `.adapt…with`.

### Adapter

An **Adapter** is a peer of Boundary, scoped to one target Boundary. It owns external realizations of that target’s Intents and may `using` Intents from any boundary. **Default for cross-boundary wiring** — including when contracts match — is an Adapter (or same-boundary Provider) **passthrough**, not an identity alias. That keeps origin, graph edges, lifetime, and room for policy explicit.

```ts
import { adapter, err, ok } from "@xndrjs/forma";

type PgOrderId = { readonly order_id: string };
type PgOrder = { readonly order_id: string; readonly amount_cents: number };
type PgFindError = { readonly code: "NO_ROW" };

const Postgres = boundary("postgres");
const SelectOrder = Postgres.intent("selectOrder").contract<PgOrderId, PgOrder, PgFindError>();

const OrdersAdapter = adapter("orders-postgres", Orders);

export const FindOrderViaPostgresProvider = OrdersAdapter.adapt(FindOrder)
  .using({ select: SelectOrder })
  .with(
    ({ deps: { select } }) =>
      async function (id) {
        const row = await select({ order_id: id.id });
        if (!row.ok) {
          return err({ kind: "not_found" as const });
        }
        return ok({
          id: row.value.order_id,
          total: row.value.amount_cents / 100,
        });
      }
  );
```

`.adapt` rejects Intents whose BoundaryId does not match the Adapter’s target (compile-time). The result is a Provider registerable in private `wiring`, with `origin: { kind: "adapter", id: "orders-postgres" }`. Adapter Providers cannot be Surface roots.

When shapes already match, the factory can forward without mapping (`return select(input)`). Reserve `aliasIntent(required, satisfier)` for deliberate synonyms (rename / migration). There is no `forward` helper yet.

### Compose and execution context

Prefer an **inline** `compose({ entryBoundaries, surface, wiring })` literal. Entry Boundaries are the exact, non-empty set of Boundary origins exposed by the Surface. Every declared Entry Boundary must own at least one Surface alias, every Surface root must come from one of them, and Adapter roots are rejected. This keeps public graph direction and Provider precision explicit — you do **not** need `defineWiring` in the normal case.

```ts
import { compose } from "@xndrjs/forma";

const SelectOrderProvider = SelectOrder.provide.with(
  (_ctx) =>
    function (id) {
      return id.order_id === "42"
        ? ok({ order_id: "42", amount_cents: 10000 })
        : err({ code: "NO_ROW" as const });
    }
);

const root = compose({
  entryBoundaries: [Orders],
  surface: { getOrder: GetOrderProvider },
  wiring: [SelectOrderProvider, ConnProvider, FindOrderViaPostgresProvider],
});

const result: Result<Order, FindError> = await root.withExecutionContext(async (surface) => {
  return surface.getOrder({ id: "42" });
});

await root.dispose();
```

`defineWiring` / `defineComposition` exist only if you **extract** wiring (or the whole options bag) into a variable or module: a plain `const wiring = [A, B]` widens to `Provider[]` and type-checks as if private providers were missing. Inline (or `as const` / `defineWiring`) keeps the tuple precise. Do not annotate a concrete config as `ComposeOptions` — that widens Entry Boundaries, Surface, and Wiring and prevents exact provenance/graph checks. Provider unions in one surface or wiring slot are rejected.

Host-owned lifetime (no callback), with params (inferred from `GetOrderProvider`’s ParamsReq; use `compose<Superset>()` only to widen):

```ts
const rooted = compose({
  entryBoundaries: [Orders],
  surface: { getOrder: GetOrderProvider },
  wiring: [SelectOrderProvider, ConnProvider, FindOrderViaPostgresProvider],
});

await using execution = rooted.openExecutionContext({ params: { role: "viewer" } });
await execution.surface.getOrder({ id: "42" });
```

Only surface aliases declared in `compose({ entryBoundaries, surface })` are callable, nested on `execution.surface` (lifecycle stays on the handle). Intent identity is the structured pair `(boundaryId, intentName)` — competing realizations of the same pair throw at compose time. `compose` also builds a dependency plan (`using` + Intent-alias edges), rejects cycles with a full path diagnostic, requires a closed graph, and derives effective lifetimes before returning the root. `describePlan()` includes Entry Boundary ids, Surface root provenance, and Provider lifetimes plus Boundary/Adapter origin. Private providers and `aliasIntent()` entries share one `wiring` array; prefer Adapter passthrough for cross-boundary wiring. See `apps/forma-demo` for a dual-Adapter end-to-end example (`postgres` | `memory`, params policy, `WatchOrders` entry stream delegating to a private `WatchOrderEvents` seam, async connection, inferred lifetimes, `await using` root).

### Stream Intent

Declare a **stream** Contract with `boundary.stream(name).contract<Input, Item, Err>()`. Same `.provide` / `.adapt` builders; the factory returns a `StreamOperation` (`async function*` or any `AsyncIterable` producer) that receives `(input, invocation)` where `invocation.signal` is per call and subordinate to the execution-context signal.

```ts
type OrderEvent = { readonly orderId: string; readonly status: string };
type WatchError = { readonly kind: "unavailable" };

const WatchOrders = Orders.stream("watchOrders").contract<OrderId, OrderEvent, WatchError>();

const WatchOrdersProvider = WatchOrders.provide.with(
  () =>
    async function* (id, invocation) {
      try {
        invocation.signal.throwIfAborted();
        yield ok({ orderId: id.id, status: "open" });
        yield ok({ orderId: id.id, status: "paid" });
      } finally {
        // runs on natural end, break, return(), AsyncDisposable, or context/root dispose
      }
    }
);

const streamingRoot = compose({
  entryBoundaries: [Orders],
  surface: { watchOrders: WatchOrdersProvider },
});

await using execution = streamingRoot.openExecutionContext();
for await (const event of execution.surface.watchOrders({ id: "42" })) {
  if (!event.ok) break; // expected Err is terminal (wrapper enforces)
  // …
}
```

Ownership and cancellation (see [streaming-intents.md](./docs/streaming-intents.md), [ADR 0012](./docs/adr/0012-streaming-intents.md)):

- Each surface call returns a **cold, single-consumer** `AsyncIterable` (+ `[Symbol.asyncDispose]`). Creating it does not materialize the Provider; the first `next()` does.
- Every active stream invocation is **owned by the execution context** (lease + registry), independent of Provider effective lifetime — including streams from composition-effective Providers.
- `break` / `return()` / `await using` on the iterable, context `dispose`, and root `dispose` close active streams (abort per-stream signal → `return()` → await `finally` → release-once). Cancelling one stream does not abort siblings or the context.
- Opening with an already-aborted host signal fails immediately. A later host abort rejects new unary work with `signal.reason`, and a cold stream that has not started completes without materialization. Already-accepted work observes cancellation cooperatively. Host abort does **not** auto-`dispose()` the context (abort ≠ dispose).
- Stream cleanup failures are observed by the caller that initiates close. Context/root disposal still attempts every stream and Provider cleanup and aggregates multiple failures.
- Adapter preserves modality; unary↔stream Intent alias fails at compile time. `using` a Stream Intent resolves to the `StreamOperation`, never an open iterator. `describePlan()` reports `mode: "unary" | "stream"` on every registered Intent.

## Status

PoC (`0.1.0-alpha.0`): closed compositions, `.contract`, Adapter peer of Boundary, rare structural `aliasIntent`, graph-derived effective lifetimes, unified `.with({ deps?, lifetime })`, Design C execution API, async factories, Stream Intent modality, disposal. Not a general-purpose IoC container.
