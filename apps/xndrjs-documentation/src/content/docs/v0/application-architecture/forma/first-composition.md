---
title: Your first Composition
description: Declare an Intent, realize it with a Provider, publish it through a Surface, and execute it safely.
---

This guide builds one closed unary Composition. The example is deliberately small: its purpose is
to make the relationship between Contract, Provider, Surface, and execution visible before adding
cross-Boundary wiring.

## 1. Declare the Boundary and Contract

```ts
import { boundary } from "@xndrjs/forma";

export type OrderId = string;
export type Order = { readonly id: string; readonly total: number };
export type GetOrderDetailsError = { readonly code: "not_found" };

export const Orders = boundary("orders");

export const GetOrderDetailsUseCase = Orders.intent("getOrderDetailsUseCase").contract<
  OrderId,
  Order,
  GetOrderDetailsError
>();
```

`GetOrderDetailsUseCase` owns the promise. It does not mention a database, HTTP client, cache,
factory, or lifetime.

Expected errors conventionally use a `code` discriminant. Forma reserves `kind` for the outer
`InvocationOutcome` protocol.

## 2. Attach a Provider

```ts
const orders = new Map<string, Order>([["42", { id: "42", total: 100 }]]);

export const GetOrderDetailsProvider = GetOrderDetailsUseCase.provide.with(({ out }) => {
  return function getOrderDetails(id) {
    const order = orders.get(id);
    return order ? out.success(order) : out.expectedError({ code: "not_found" });
  };
});
```

`.with` receives a factory context and returns the operation that fulfills the Intent. Inside a
Provider factory, prefer the Contract-scoped `out` constructors: they know this Intent's successful
and expected-error types.

The operation may be synchronous or asynchronous. Surface calls are always asynchronous for unary
Intents because the Provider itself may need lazy asynchronous materialization.

## 3. Close the graph

```ts
import { compose } from "@xndrjs/forma";

export const ordersRoot = compose({
  entryBoundaries: [Orders],
  surface: {
    getOrderDetails: GetOrderDetailsProvider,
  },
});
```

The options literal carries exact type information into `compose`:

- `Orders` is the only Entry Boundary;
- `getOrderDetails` is the only public alias;
- there is no private wiring because this Provider has no Intent dependencies.

Forma validates the graph immediately. Provider factories remain lazy and have not run yet.

## 4. Execute in a lexical scope

```ts
const outcome = await ordersRoot.withExecutionContext(async (surface) => {
  return surface.getOrderDetails("42");
});
```

`withExecutionContext` opens a context, lends its typed Surface to the callback, and disposes the
context in a `finally` path. It is the safe default for short flows.

Handle the complete Contract at the call site:

```ts
switch (outcome.kind) {
  case "success":
    console.log(outcome.value.total);
    break;

  case "expectedError":
    // Typed as GetOrderDetailsError.
    console.log(outcome.error.code);
    break;

  case "unexpectedFailure":
    // Opaque: propagate or apply generic policy; do not inspect a cause.
    console.error(outcome.failure.id);
    break;

  case "cancelled":
    // Cancellation represented as Intent data.
    break;
}
```

Expected errors belong to the Contract and may be handled semantically. An implementation throw or
rejection is converted at its Boundary of origin into an opaque `unexpectedFailure`; callers do not
need a defensive `try/catch` around every dependency invocation.

Lifecycle failures and host-abort acceptance remain outside this algebra. They may still reject the
execution or disposal Promise.

## 5. Let a host own the context when necessary

When a context must outlive one callback, open the handle explicitly:

```ts
await using execution = ordersRoot.openExecutionContext();

const first = await execution.surface.getOrderDetails("42");
const second = await execution.surface.getOrderDetails("missing");

console.log(first, second);
```

The handle exposes lifecycle separately from the Surface:

```text
execution.surface.getOrderDetails(...)
execution.signal
execution.params
execution.dispose()
```

Surface aliases are never flattened onto the handle, and internal Providers never appear there.

If `await using` is not appropriate for the host, dispose explicitly:

```ts
const execution = ordersRoot.openExecutionContext();
try {
  await execution.surface.getOrderDetails("42");
} finally {
  await execution.dispose();
}
```

## 6. Dispose the root

The Composition root owns composition-effective Provider instances and is the shutdown backstop:

```ts
await ordersRoot.dispose();
```

Root disposal refuses new contexts, closes every context still open, and then runs root-owned
cleanups. Root and context disposal are terminal and idempotent: concurrent callers share the same
Promise.

For a process-level Composition, the root itself can use explicit resource management:

```ts
await using root = compose({
  entryBoundaries: [Orders],
  surface: { getOrderDetails: GetOrderDetailsProvider },
});

await root.withExecutionContext((surface) => {
  return surface.getOrderDetails("42");
});
```

## Next step

This graph has no private dependencies. Continue with
[Providers and dependencies](/v0/application-architecture/forma/providers-and-dependencies/) to
add `using`, Params, lazy resource acquisition, and graph-derived lifetimes.
