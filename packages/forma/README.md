# @xndrjs/forma

Intent-oriented composition for TypeScript: declare **boundaries** and **intents**, attach **providers**, and wire a closed graph with `compose`. The composition owns the public **surface**, lazy materialization, and execution-context lifetimes.

This package is a proof of concept. Vocabulary lives in [GLOSSARY.md](./GLOSSARY.md); design records live under [docs/adr/](./docs/adr/) (Adapter peer of Boundary; unified `wiring` registration).

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

`.with` takes a factory that returns the Intent operation as a `function`. Prefer `ctx => function (…) { … }` over nested arrows. Destructure context only when you use it.

```ts
import { err, ok } from "@xndrjs/forma";

const FindProvider = FindOrder.provide.with(
  (_ctx) =>
    function (id) {
      return id.id === "42" ? ok({ id: "42", total: 100 }) : err({ kind: "not_found" as const });
    }
);

const ConnProvider = Conn.provide.perContext().with(({ lifetime }) => {
  const conn = openConnection();
  lifetime.onDispose(() => conn.close());
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

Default lifetime is shared by the composition root. `.perContext()` materializes once per `createExecutionContext()`. A composition-lifetime provider must not depend on a `.perContext()` provider (compile-time and runtime).

`Intent.provide.using` accepts only same-boundary Intents. Every Provider carries a required `origin` discriminant: `{ kind: "boundary", id }` from `Intent.provide…with`, or `{ kind: "adapter", id }` from Adapter `.adapt…with`.

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

const ctx = root.createExecutionContext();
const result: Result<Order, FindError> = await ctx.getOrder({ id: "42" });
await ctx.dispose();
await root.dispose();
```

Only `surface` aliases are callable on the context. Competing realizations of the same Intent identity throw at compose time. Private providers and `bind()` aliases share one `wiring` array; prefer Adapter when shapes differ. See `apps/forma-demo` for a small end-to-end example.

## Status

PoC (`0.0.0`): closed compositions, `.contract`, Adapter peer of Boundary, structural `bind`, lifetime edges, unified `.with({ deps?, lifetime })`, disposal. Not a general-purpose IoC container.
