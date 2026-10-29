# @xndrjs/forma

Intent-oriented composition for TypeScript: declare **boundaries** and **intents**, attach **providers**, and wire a closed graph with `compose`. The composition owns the public **surface**, lazy materialization, and execution-context lifetimes.

This package is a proof of concept. Vocabulary lives in [GLOSSARY.md](./GLOSSARY.md); design records live under [docs/adr/](./docs/adr/) (Adapter peer of Boundary; unified `wiring` registration; surface/`using` key hygiene; Design C execution API; execution seed / `AbortSignal`).

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

Name first, then `.contract<Input, Success, Err>()` — TypeScript keeps the literal Intent name that way.

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

const ConnProvider = Conn.provide.perContext().with(async ({ lifetime }) => {
  const conn = await openConnection({ signal: lifetime.signal });
  lifetime.onDispose(() => conn.close());
  // `.perContext()` only: lifetime.seed holds the execution seed from open/with.
  return function () {
    return ok(conn);
  };
});

const GetOrderProvider = GetOrder.provide
  .perContext()
  .using({ find: FindOrder })
  .with(
    ({ deps: { find } }) =>
      function (id) {
        return find(id);
      }
  );
```

Default lifetime is shared by the composition root. `.perContext()` materializes once per `openExecutionContext()` / `withExecutionContext()`. A composition-lifetime provider must not depend on a `.perContext()` provider (compile-time and runtime). Root and context `dispose()` are terminal state machines (concurrent callers share one promise); entering `disposing` aborts that scope’s `AbortSignal` (`lifetime.signal` / `execution.signal`). `root.dispose()` also closes any open execution contexts. Prefer `withExecutionContext` (or `await using` on the open handle) for short lexical scopes; use `openExecutionContext` when a host owns the lifetime across mount/unmount. `createExecutionContext` remains a deprecated alias of `open`.

Optional typed **seed**: `compose({ … })` defaults to no seed; `compose<MySeed>()({ … })` makes `{ seed }` required on both `open` and `with` (shared `ExecutionContextArgs`). `.perContext()` factories read `lifetime.seed`; composition-lifetime factories must not. An optional host `signal` on those args links into the context signal without transferring dispose ownership.

`Intent.provide.using` accepts only same-boundary Intents, is **one-shot** (do not chain `.using`), and requires string dependency keys. Surface aliases are likewise string-only; `dispose` and `surface` are reserved on the composition surface map (operations nest under `execution.surface`). Every Provider carries a required `origin` discriminant: `{ kind: "boundary", id }` from `Intent.provide…with`, or `{ kind: "adapter", id }` from Adapter `.adapt…with`.

### Adapter

An **Adapter** is a peer of Boundary, scoped to one target Boundary. It owns external realizations of that target’s Intents and may `using` Intents from any boundary. Prefer Adapter when contracts differ or multi-boundary orchestration is required; same-shape `bind` remains a lightweight escape hatch.

```ts
import { adapter, err, ok } from "@xndrjs/forma";

const OrdersAdapter = adapter("orders-postgres", Orders);

export const FindOrderAdapter = OrdersAdapter.adapt(FindOrder)
  .perContext()
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

`.adapt` rejects Intents whose BoundaryId does not match the Adapter’s target (compile-time). The result is a Provider registerable in `wiring` / `surface`, with `origin: { kind: "adapter", id: "orders-postgres" }`.

### Compose and execution context

```ts
import { compose } from "@xndrjs/forma";

const root = compose({
  surface: { getOrder: GetOrderProvider },
  wiring: [SelectOrderProvider, ConnProvider, FindOrderAdapter],
});

const result: Result<Order, FindError> = await root.withExecutionContext(async (surface) => {
  return surface.getOrder({ id: "42" });
});

await root.dispose();
```

Host-owned lifetime (no callback), with seed:

```ts
type RequestSeed = { readonly tenantId: string };

const seeded = compose<RequestSeed>()({
  surface: { getOrder: GetOrderProvider },
  wiring: [SelectOrderProvider, ConnProvider, FindOrderAdapter],
});

await using execution = seeded.openExecutionContext({ seed: { tenantId: "acme" } });
await execution.surface.getOrder({ id: "42" });
```

Only aliases declared in `compose({ surface })` are callable, nested on `execution.surface` (lifecycle stays on the handle). Intent identity is the structured pair `(boundaryId, intentName)` — competing realizations of the same pair throw at compose time. `compose` also builds a dependency plan (`using` + Binding edges), rejects cycles with a full path diagnostic, and requires a closed graph before returning the root. Private providers and `bind()` aliases share one `wiring` array; prefer Adapter when shapes differ. See `apps/forma-demo` for a small end-to-end example.

## Status

PoC (`0.0.0`): closed compositions, `.contract`, Adapter peer of Boundary, structural `bind`, lifetime edges, unified `.with({ deps?, lifetime })`, disposal. Not a general-purpose IoC container.
