# @xndrjs/forma

Intent-oriented composition for TypeScript: declare **boundaries** and **intents**, attach **providers**, and wire a closed graph with `compose`. The composition owns the public **surface**, lazy materialization, and execution-context lifetimes.

This package is a proof of concept. Vocabulary lives in [GLOSSARY.md](./GLOSSARY.md); design notes in [specs/initial-analysis.md](./specs/initial-analysis.md).

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

### Compose and execution context

```ts
import { bind, compose } from "@xndrjs/forma";

const root = compose({
  surface: { getOrder: GetOrderProvider },
  providers: [SelectOrderProvider, ConnProvider],
  bindings: [bind(FindOrder, SelectOrder)],
});

const ctx = root.createExecutionContext();
const result: Result<Order, FindError> = await ctx.getOrder({ id: "42" });
await ctx.dispose();
await root.dispose();
```

Only `surface` aliases are callable on the context. Cross-boundary wiring goes through `bindings` (`bind` requires structurally equivalent contracts). See `apps/forma-demo` for a small end-to-end example.

## Status

PoC (`0.0.0`): closed compositions, `.contract`, structural `bind`, lifetime edges, unified `.with({ deps?, lifetime })`, disposal. Not a general-purpose IoC container.
