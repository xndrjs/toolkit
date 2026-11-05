---
title: Forma
description: Intent-oriented composition for TypeScript applications with explicit boundaries, closed dependency graphs, and owned lifecycles.
---

`@xndrjs/forma` is an intent-oriented composition library for TypeScript. It gives applications a
small vocabulary for making architectural ownership, dependencies, public entry points, and
resource lifetimes explicit.

Forma starts by making architectural ownership explicit:

- a **Boundary** owns a local architectural language and its contracts;
- an **Intent** names something that Boundary promises, independently of its implementation;
- a **Provider** says how that Intent is realized;
- a **Composition** decides which realizations form one executable graph.

Ordinary dependency injection can connect implementations without preserving those distinctions.
Forma makes them part of the graph. Implementations can then change without turning the meaning of
the system into moving infrastructure, and the graph can be validated before the application begins
executing it.

## Install

```bash
pnpm add @xndrjs/forma
```

The current alpha targets Node.js `>=24 <26`.

## A minimal composition

```ts
import { boundary, compose } from "@xndrjs/forma";

type OrderId = string;
type Order = { readonly id: string; readonly total: number };
type GetOrderDetailsError = { readonly code: "not_found" };

const Orders = boundary("orders");

const GetOrderDetailsUseCase = Orders.intent("getOrderDetailsUseCase").contract<
  OrderId,
  Order,
  GetOrderDetailsError
>();

const GetOrderDetailsProvider = GetOrderDetailsUseCase.provide.with(({ out }) => {
  return function getOrderDetails(id) {
    return id === "42"
      ? out.success({ id: "42", total: 100 })
      : out.expectedError({ code: "not_found" });
  };
});

const root = compose({
  entryBoundaries: [Orders],
  surface: { getOrderDetails: GetOrderDetailsProvider },
});

const outcome = await root.withExecutionContext((surface) => {
  return surface.getOrderDetails("42");
});

switch (outcome.kind) {
  case "success":
    console.log(outcome.value);
    break;
  case "expectedError":
    console.log(outcome.error.code);
    break;
  case "unexpectedFailure":
    console.error("Unexpected failure", outcome.failure.id);
    break;
  case "cancelled":
    console.log("Cancelled");
    break;
}

await root.dispose();
```

This small graph already establishes several properties:

- `Orders` owns the Intent and its Contract;
- the Provider realizes that Contract but does not redefine it;
- only `getOrderDetails` is public;
- the public traversal starts from the declared `Orders` Entry Boundary;
- the execution context is disposed after the callback;
- every Intent exit uses the typed `InvocationOutcome` protocol.

## What Forma owns

| Concern                    | Forma's role                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Architectural identity     | Names Intents inside explicit Boundaries                                           |
| Realization                | Associates Intent, dependencies, lifetime policy, and implementation in a Provider |
| Cross-Boundary integration | Gives semantic translation an explicit Adapter identity                            |
| Graph closure              | Rejects missing providers, cycles, competing realizations, and incompatible edges  |
| Public API                 | Publishes only the aliases selected by the Composition Surface                     |
| Lifecycle                  | Lazily materializes Providers and disposes their resources through owned scopes    |
| Failure protocol           | Keeps expected errors typed and censors unexpected causes at Boundary exits        |
| Streaming                  | Owns cold stream invocations, cancellation, and cleanup                            |

Forma is not a general-purpose IoC container, a service locator, a domain-modeling language, or an
application framework. It does not require a directory hierarchy and does not turn every function
into an Intent.

## Where to continue

- [Mental model](/v0/application-architecture/forma/mental-model/) defines the vocabulary and the
  relationships between its concepts.
- [Your first Composition](/v0/application-architecture/forma/first-composition/) builds a runnable
  graph step by step.
- [Providers and dependencies](/v0/application-architecture/forma/providers-and-dependencies/)
  covers lazy materialization, Params, and lifetimes.
- [Adapters and evolution](/v0/application-architecture/forma/adapters-and-evolution/) shows how
  Boundaries collaborate and how ownership can move over time.
- [Composition and execution](/v0/application-architecture/forma/composition-and-execution/)
  explains Surface direction, Entry Boundaries, execution contexts, and disposal.
- [Errors and outcomes](/v0/application-architecture/forma/errors-and-outcomes/) documents the
  total Boundary-exit protocol.
- [Streaming](/v0/application-architecture/forma/streaming/) covers cold pull-based streams and
  their ownership model.
- [Inspection and testing](/v0/application-architecture/forma/inspection-and-testing/) covers
  `describePlan()`, validation boundaries, package checks, and current non-goals.

Forma is currently alpha. The public model is implemented and tested, but breaking API changes may
still occur while the vocabulary and ergonomics are being validated in real applications.
