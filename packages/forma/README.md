# @xndrjs/forma

Intent-oriented composition for TypeScript: declare **boundaries** and **intents**, attach **providers**, and wire a closed graph with `compose`. The composition owns the public **surface**, lazy materialization, and execution-context lifetimes.

This package is a proof of concept. Vocabulary lives in [GLOSSARY.md](./GLOSSARY.md); design records live under [docs/adr/](./docs/adr/) (Adapter peer of Boundary; unified `wiring` registration; Intent alias / Adapter passthrough default; surface/`using` key hygiene; Design C execution API; execution params / `AbortSignal`; effective lifetime inference; Stream Intent modality / ownership — [ADR 0012](./docs/adr/0012-streaming-intents.md); Entry Boundary and Surface direction — [ADR 0013](./docs/adr/0013-entry-boundaries-and-surface-direction.md); nominal Providers and runtime branding — [ADR 0014](./docs/adr/0014-nominal-providers-and-runtime-branding.md); Boundary error totalization — [ADR 0015](./docs/adr/0015-boundary-error-totalization.md); optional `defineWiring` when extracting wiring).

## Installation

```bash
npm install @xndrjs/forma
```

## Quick start

### Boundary, Intent, contract

```ts
import { boundary } from "@xndrjs/forma";

type OrderId = string;
type Order = { readonly id: string; readonly total: number };
/** Expected Errors use a finite `code` discriminant; `kind` belongs to InvocationOutcome. */
type FindOrderError = { readonly code: "not_found" };
type GetOrderDetailsError = FindOrderError | { readonly code: "forbidden" };

const Orders = boundary("orders");

export const FindOrderById = Orders.intent("findOrderById").contract<
  OrderId,
  Order,
  FindOrderError
>();
export const GetOrderDetailsUseCase = Orders.intent("getOrderDetailsUseCase").contract<
  OrderId,
  Order,
  GetOrderDetailsError
>();
```

Name first, then `.contract<Input, Success, Err>()` — TypeScript keeps the literal Intent name that way. `boundary.intent` is always **unary** (one terminal `InvocationOutcome`). For pull-based sequences use `boundary.stream` (below). Every Boundary Intent exit is totalized: implementation throw/rejection becomes `unexpectedFailure` at the origin ([ADR 0015](./docs/adr/0015-boundary-error-totalization.md)).

### Providers

`.with` takes a factory that returns the Intent operation as a `function` (sync or `async`). Prefer `ctx => function (…) { … }` over nested arrows. Destructure context only when you use it. `Lifetime.onDispose` is valid only during that materialization attempt — after the factory returns, the handle is sealed; on failure Forma rolls back local cleanups immediately and does not cache the attempt.

The resulting Provider is an immutable nominal descriptor. Its public metadata is `intent`,
`deps`, `origin`, and `lifetimePolicy`; realization and Params inference machinery remain internal.
Use `compose` to exercise Provider behavior—Provider factories are not a public invocation or
monkey-patching seam.

```ts
const FindOrderByIdProvider = FindOrderById.provide.with(
  ({ out }) =>
    function (id) {
      return id === "42"
        ? out.success({ id: "42", total: 100 })
        : out.expectedError({ code: "not_found" as const });
    }
);

type ConnHandle = { close(): void };
async function openConnection(opts: { signal: AbortSignal }): Promise<ConnHandle> {
  opts.signal.throwIfAborted();
  return { close() {} };
}

const Conn = Orders.intent("conn").contract<void, ConnHandle, never>();
const ConnProvider = Conn.provide.perContext().with(async ({ lifetime, out }) => {
  const conn = await openConnection({ signal: lifetime.signal });
  lifetime.onDispose(() => conn.close());
  return function () {
    return out.success(conn);
  };
});

type OrderParams = { readonly role: "admin" | "viewer" | "guest" };

const GetOrderDetailsProvider = GetOrderDetailsUseCase.provide
  .perContext<OrderParams>()
  .using({ findOrderById: FindOrderById })
  .with(
    ({ deps: { findOrderById }, params, out }) =>
      function (id) {
        if (params.role === "guest") {
          return out.expectedError({ code: "forbidden" as const });
        }
        return findOrderById(id); // forwards success / expectedError / unexpectedFailure / cancelled
      }
  );
```

`.with` always receives `out` typed to this Intent's `Success` / `Err` (autocomplete and early checking on `expectedError` / `success`). Its `match` combinator translates a dependency outcome into the current Contract, requires every declared source Expected Error code, and propagates `unexpectedFailure` / `cancelled` unchanged. A module-level `out` export remains for open-generic construction outside factories; matching is Contract-scoped and therefore available only on `ctx.out`.

Lifetime policy is local, while effective lifetime is derived from the resolved graph. No modifier means `auto`: the Provider is shared by the composition root unless any transitive dependency is context-owned, in which case it is narrowed to one instance per `openExecutionContext()` / `withExecutionContext()`. `.perContext()` forces context ownership; `.perComposition()` pins root ownership and makes `compose()` fail with the dependency path if a transitive dependency requires a context. `root.describePlan()` reports declared and effective lifetimes. Root and context `dispose()` are terminal state machines (concurrent callers share one promise); entering `disposing` aborts that owner’s `AbortSignal` (`lifetime.signal` / `execution.signal`). `root.dispose()` also closes any open execution contexts. Prefer `withExecutionContext` (or `await using` on the open handle) for short lexical scopes; use `openExecutionContext` when a host owns the lifetime across mount/unmount.

Typed execution **params**: declare a plain outer object bag on `.perContext<ParamsReq>()`. `compose({ … })` **infers** the required host bag from all such declarations (merge; conflicting key types fail at compose). open/with then require `{ params }` (shared `ExecutionContextArgs`). At runtime Forma accepts only an `Object.prototype`/`null`-prototype bag with own enumerable string data properties, clones it, and shallow-freezes the copy; nested values are not validated or frozen. The execution handle and all per-context factories receive that same copy. Factories read typed `params` on the `.with` context — not on `Lifetime`. `compose<Explicit>()({ … })` is only for an explicit **superset** of the inferred bag and applies the same best-effort static shape check. An optional host `signal` on those args links into the context signal without transferring dispose ownership.

`Intent.provide.using` accepts only same-boundary Intents, is **one-shot** (do not chain `.using`), and requires string dependency keys. Surface aliases are likewise string-only; `dispose` and `surface` are reserved on the composition surface map (operations nest under `execution.surface`). Every Provider carries a required `origin` discriminant: `{ kind: "boundary", id }` from `Intent.provide…with`, or `{ kind: "adapter", id }` from Adapter `.adapt…with`.

### Adapter

An **Adapter** is a peer of Boundary, scoped to one target Boundary. It owns external realizations of that target’s Intents and may `using` Intents from any boundary. **Default for cross-boundary wiring** — including when contracts match — is an Adapter (or same-boundary Provider) **passthrough**, not an identity alias. That keeps origin, graph edges, lifetime, and room for policy explicit.

```ts
import { adapter } from "@xndrjs/forma";

type SelectOrderInput = { readonly order_id: string };
type PgOrder = { readonly order_id: string; readonly amount_cents: number };
type PgFindError = { readonly code: "NO_ROW" };

const Postgres = boundary("postgres");
const SelectOrder = Postgres.intent("selectOrder").contract<
  SelectOrderInput,
  PgOrder,
  PgFindError
>();

const OrdersAdapter = adapter("orders-postgres", Orders);

export const FindOrderByIdViaPostgresProvider = OrdersAdapter.adapt(FindOrderById)
  .using({ select: SelectOrder })
  .with(
    ({ deps: { select }, out }) =>
      async function (id) {
        const row = await select({ order_id: id });
        return out.match(row, {
          success: (value) =>
            out.success({
              id: value.order_id,
              total: value.amount_cents / 100,
            }),
          expectedError: {
            NO_ROW: () => out.expectedError({ code: "not_found" }),
          },
        });
      }
  );
```

`.adapt` rejects Intents whose BoundaryId does not match the Adapter’s target (compile-time). The result is a Provider registerable in private `wiring`, with `origin: { kind: "adapter", id: "orders-postgres" }`. Adapter Providers cannot be Surface roots. Map only `success` / `expectedError`; pass `unexpectedFailure` / `cancelled` through. Do not wrap Forma dependency calls in `try/catch` for implementation failure — the dependency Intent is already totalized.

`out.match` makes that policy structural: each source Expected Error handler is keyed and narrowed by its `code`, while terminal protocol branches pass through automatically. If an external system produces an undeclared code at runtime, the missing match becomes a new `unexpectedFailure` at the translating Provider or Adapter instead of being silently misclassified.

When shapes already match, the factory can forward without mapping (`return select(input)`). Reserve `aliasIntent(required, satisfier)` for deliberate synonyms (rename / migration). There is no `forward` helper yet.

### Compose and execution context

Prefer an **inline** `compose({ entryBoundaries, surface, wiring })` literal. Entry Boundaries are the exact, non-empty set of authentic `boundary()` values whose origins are exposed by the Surface. Every declared Entry Boundary must own at least one Surface alias, every Surface root must come from one of them, and Adapter roots are rejected. Runtime branding validates protocol provenance, not security. This keeps public graph direction and Provider precision explicit — you do **not** need `defineWiring` in the normal case.

```ts
import { compose, type InvocationOutcome } from "@xndrjs/forma";

const SelectOrderProvider = SelectOrder.provide.with(
  ({ out }) =>
    function (id) {
      return id.order_id === "42"
        ? out.success({ order_id: "42", amount_cents: 10000 })
        : out.expectedError({ code: "NO_ROW" as const });
    }
);

const root = compose({
  entryBoundaries: [Orders],
  surface: { getOrderDetails: GetOrderDetailsProvider },
  wiring: [SelectOrderProvider, ConnProvider, FindOrderByIdViaPostgresProvider],
  // Optional: only automatic throw→unexpectedFailure conversions (once at origin).
  onUnexpectedFailure(event) {
    console.error(event.failure.id, event.cause, event.intent, event.phase);
  },
});

const result: InvocationOutcome<Order, GetOrderDetailsError> = await root.withExecutionContext(
  async (surface) => {
    return surface.getOrderDetails("42");
  }
);

await root.dispose();
```

For an explicit unexpected condition, `out.unexpectedFailure()` creates the opaque token directly.
Pass a reporter when the originating Boundary must correlate censored diagnostics with that token:

```ts
return out.unexpectedFailure((failure) =>
  reportUnexpectedFailure({
    failureId: failure.id,
    source: "postgres.selectOrder",
    diagnostic: { code: externalCode },
  })
);
```

The reporter overload always returns a Promise, awaits synchronous or asynchronous reporting, and
preserves the original failure if reporting throws or rejects. Its resolved value is ignored and it
does not notify `onUnexpectedFailure`; that Composition hook remains reserved for automatic
throw/rejection conversion. In a stream, yield the resolved terminal outcome with
`yield await out.unexpectedFailure(report)`.

`defineWiring` / `defineComposition` exist only if you **extract** wiring (or the whole options bag) into a variable or module: a plain `const wiring = [A, B]` widens to `Provider[]` and type-checks as if private providers were missing. Inline (or `as const` / `defineWiring`) keeps the tuple precise. Do not annotate a concrete config as `ComposeOptions` — that widens Entry Boundaries, Surface, and Wiring and prevents exact provenance/graph checks. Provider unions in one surface or wiring slot are rejected.

Host-owned lifetime (no callback), with params (inferred from `GetOrderDetailsProvider`’s ParamsReq; use `compose<Superset>()` only to widen):

```ts
const rooted = compose({
  entryBoundaries: [Orders],
  surface: { getOrderDetails: GetOrderDetailsProvider },
  wiring: [SelectOrderProvider, ConnProvider, FindOrderByIdViaPostgresProvider],
});

await using execution = rooted.openExecutionContext({ params: { role: "viewer" } });
await execution.surface.getOrderDetails("42");
```

Only surface aliases declared in `compose({ entryBoundaries, surface })` are callable, nested on `execution.surface` (lifecycle stays on the handle). Intent identity is the structured pair `(boundaryId, intentName)` — competing realizations of the same pair throw at compose time. Repeated declarations of that identity must have exactly equivalent Input, Success/Item, Err, and modality on every resolved `using` edge; runtime additionally rejects reified modality mismatches during compose. `compose` also builds a dependency plan (`using` + Intent-alias edges), rejects cycles with a full path diagnostic, requires a closed graph, and derives effective lifetimes before returning the root. `describePlan()` includes Entry Boundary ids, Surface root provenance, Boundary/Adapter origin, and a nested `lifetime` explanation per Provider. Private providers and `aliasIntent()` entries share one `wiring` array; prefer Adapter passthrough for cross-boundary wiring. See `apps/forma-demo` for two focused examples: Orders compares real SQLite and memory Adapters while exercising params, streams, lifetimes, and disposal; Editorial demonstrates Entry Boundaries, capability extraction, a migration alias, and semantic translation through Adapters.

### Stream Intent

Declare a **stream** Contract with `boundary.stream(name).contract<Input, Item, Err>()`. Same `.provide` / `.adapt` builders; the factory returns a `StreamOperation` (`async function*` or any `AsyncIterable` producer) that receives `(input, invocation)` where `invocation.signal` is per call and subordinate to the execution-context signal.

```ts
type OrderEvent = { readonly orderId: string; readonly status: string };
type WatchError = { readonly code: "unavailable" };

const WatchOrderEventsUseCase = Orders.stream("watchOrderEventsUseCase").contract<
  OrderId,
  OrderEvent,
  WatchError
>();

const WatchOrderEventsProvider = WatchOrderEventsUseCase.provide.with(
  ({ out }) =>
    async function* (id, invocation) {
      try {
        invocation.signal.throwIfAborted();
        yield out.success({ orderId: id, status: "open" });
        yield out.success({ orderId: id, status: "paid" });
      } finally {
        // runs on natural end, break, return(), AsyncDisposable, or context/root dispose
      }
    }
);

const streamingRoot = compose({
  entryBoundaries: [Orders],
  surface: { watchOrderEvents: WatchOrderEventsProvider },
});

await using execution = streamingRoot.openExecutionContext();
for await (const event of execution.surface.watchOrderEvents("42")) {
  if (event.kind !== "success") break; // expectedError / unexpectedFailure / cancelled are terminal
  // …
}
```

Ownership and cancellation (see [streaming-intents.md](./docs/streaming-intents.md), [ADR 0012](./docs/adr/0012-streaming-intents.md)):

- Each surface call returns a **cold, single-consumer** `AsyncIterable` (+ `[Symbol.asyncDispose]`). Creating it does not materialize the Provider; the first `next()` does.
- Every active stream invocation is **owned by the execution context** (lease + registry), independent of Provider effective lifetime — including streams from composition-effective Providers.
- First `next()` acquires registry/lease ownership transactionally before scheduling the source. If acceptance fails, the source is not started and partial ownership is rolled back through the normal close/error matrix.
- `expectedError` / `unexpectedFailure` / `cancelled` are terminal: after exposing the first terminal event, the managed wrapper calls `return()` on the source. A producer does not need an explicit `return` after yielding one of them.
- `break` / `return()` / `await using` on the iterable, context `dispose`, and root `dispose` close active streams (abort per-stream signal → `return()` → await `finally` → release-once). Cancelling one stream does not abort siblings or the context.
- Opening with an already-aborted host signal fails immediately. A later host abort rejects new unary work with `signal.reason`, and a cold stream that has not started completes without materialization. Already-accepted work observes cancellation cooperatively. Host abort does **not** auto-`dispose()` the context (abort ≠ dispose).
- Stream cleanup failures are observed by the caller that initiates close. Context/root disposal still attempts every stream and Provider cleanup and aggregates multiple failures.
- Adapter preserves modality; unary↔stream Intent alias fails at compile time. `using` a Stream Intent resolves to the `StreamOperation`, never an open iterator. `describePlan()` reports `mode: "unary" | "stream"` on every registered Intent.

### Validate the published package

From the repository root, run `pnpm validate:forma-package`. The command builds Forma, creates the same tarball shape published to npm, validates its exports and declarations with `publint` and Are The Types Wrong, installs it into an isolated consumer, typechecks that consumer with `skipLibCheck: false`, and runs a unary/stream/disposal smoke test. It never resolves `@xndrjs/forma` through the workspace source alias.

## Status

Alpha: closed compositions, `.contract`, Adapter peer of Boundary, rare structural `aliasIntent`, graph-derived effective lifetimes, unified `.with({ deps?, lifetime })`, Design C execution API, async factories, Stream Intent modality, Boundary error totalization (`InvocationOutcome`), disposal. Not a general-purpose IoC container.
