# @xndrjs/forma

Intent-oriented composition for TypeScript: declare **boundaries** and **intents**, attach **providers**, and wire a closed graph with `compose`. The composition owns the public **surface**, lazy materialization, and execution-context lifetimes.

This package is a proof of concept. Vocabulary lives in [GLOSSARY.md](./GLOSSARY.md); design records live under [docs/adr/](./docs/adr/) (Adapter peer of Boundary; unified `wiring` registration; Intent alias / Adapter passthrough default; surface/`using` key hygiene; Design C execution API; execution params / `AbortSignal`; optional `defineWiring` when extracting wiring).

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

Default lifetime is shared by the composition root. `.perContext()` materializes once per `openExecutionContext()` / `withExecutionContext()`. A composition-lifetime provider must not depend on a `.perContext()` provider (compile-time and runtime). Root and context `dispose()` are terminal state machines (concurrent callers share one promise); entering `disposing` aborts that scope’s `AbortSignal` (`lifetime.signal` / `execution.signal`). `root.dispose()` also closes any open execution contexts. Prefer `withExecutionContext` (or `await using` on the open handle) for short lexical scopes; use `openExecutionContext` when a host owns the lifetime across mount/unmount. `createExecutionContext` remains a deprecated alias of `open`.

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

When shapes already match, the factory can forward without mapping (`return select(input)`). Reserve `aliasIntent(required, satisfier)` for deliberate synonyms (rename / migration). There is no `forward` helper yet.

### Compose and execution context

Prefer an **inline** `compose({ surface, wiring })` literal. That keeps Provider precision for the closed-graph checks — you do **not** need `defineWiring` in the normal case.

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
  surface: { getOrder: GetOrderProvider },
  wiring: [SelectOrderProvider, ConnProvider, FindOrderViaPostgresProvider],
});

const result: Result<Order, FindError> = await root.withExecutionContext(async (surface) => {
  return surface.getOrder({ id: "42" });
});

await root.dispose();
```

`defineWiring` / `defineComposition` exist only if you **extract** wiring (or the whole options bag) into a variable or module: a plain `const wiring = [A, B]` widens to `Provider[]` and type-checks as if private providers were missing. Inline (or `as const` / `defineWiring`) keeps the tuple precise. Do not annotate a concrete config as `ComposeOptions` — that widens Surface/Wiring and disables graph checks. Provider unions in one surface or wiring slot are rejected.

Host-owned lifetime (no callback), with params (inferred from `GetOrderProvider`’s ParamsReq; use `compose<Superset>()` only to widen):

```ts
const rooted = compose({
  surface: { getOrder: GetOrderProvider },
  wiring: [SelectOrderProvider, ConnProvider, FindOrderViaPostgresProvider],
});

await using execution = rooted.openExecutionContext({ params: { role: "viewer" } });
await execution.surface.getOrder({ id: "42" });
```

Only surface aliases declared in `compose({ surface })` are callable, nested on `execution.surface` (lifecycle stays on the handle). Intent identity is the structured pair `(boundaryId, intentName)` — competing realizations of the same pair throw at compose time. `compose` also builds a dependency plan (`using` + Intent-alias edges), rejects cycles with a full path diagnostic, and requires a closed graph before returning the root. Private providers and `aliasIntent()` entries share one `wiring` array; prefer Adapter passthrough for cross-boundary wiring. See `apps/forma-demo` for a dual-Adapter end-to-end example (`postgres` | `memory`, params policy, async connection, `await using` root).

## Status

PoC (`0.1.0-alpha.0`): closed compositions, `.contract`, Adapter peer of Boundary, rare structural `aliasIntent`, lifetime edges, unified `.with({ deps?, lifetime })`, Design C execution API, async factories, disposal. Not a general-purpose IoC container.
