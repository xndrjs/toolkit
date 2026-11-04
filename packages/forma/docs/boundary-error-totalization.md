# Boundary exit error totalization

> Status: **implemented** (normative decision in [ADR 0015](./adr/0015-boundary-error-totalization.md);
> amendments to [ADR 0008](./adr/0008-execution-seed-and-abort-signal.md) and
> [ADR 0012](./adr/0012-streaming-intents.md)). This document remains the extended analysis and
> validation plan.
>
> Date: 2026-10-31.
>
> Scope: errors produced during unary and stream Intent invocation, propagation across
> Boundaries, the role of Adapters, failure identity, and the Composition diagnostic fallback.
> Lifecycle errors (`dispose`, cleanup, and shutdown) remain out of scope.

## Executive summary

An Intent Contract declares `Success` and `Err`, but an operation can also terminate via throw or
Promise rejection. `Err` represents expected, catalogued errors; the exceptional channel represents
unexpected failures that TypeScript does not describe in a `Promise` type.

That split forces every calling Boundary to know two protocols:

```text
Invocation
├─ Result<Success, Err>  ← typed
└─ throw / rejection    ← unknown and untyped
```

As a result, the Contract alone is not enough to use an Intent correctly. A defensive consumer
must add `try/catch` on every crossing, but in the `catch` it receives an `unknown` whose cause,
provenance, and recovery options are unknown.

The proposed decision is to make **every Boundary exit total**:

> A throw or rejection produced by a Boundary implementation does not cross the Boundary. Forma
> converts it into an `unexpectedFailure` branch with an opaque `failureId` generated at the origin.

The target protocol is `InvocationOutcome`:

```ts
type InvocationOutcome<Success, ExpectedError> =
  | {
      readonly kind: "success";
      readonly value: Success;
    }
  | {
      readonly kind: "expectedError";
      readonly error: ExpectedError;
    }
  | {
      readonly kind: "unexpectedFailure";
      readonly failure: UnexpectedFailure;
    }
  | {
      readonly kind: "cancelled";
      readonly cancellation: Cancellation;
    };
```

This analysis decides the semantics of `success`, `expectedError`, and `unexpectedFailure`. Full normalization of
cancellation into the same protocol is related, but requires separately amending the current abort
and lifecycle decisions.

The guiding principle is:

> Semantically handleable error = error catalogued in the Contract.

An `UnexpectedFailure` only allows propagation and generic policies. It does not carry the
`cause`, so a calling Boundary cannot attempt recovery based on implementation details of the
called Boundary.

## Previous baseline (pre-implementation)

Before totalization, the published model used:

```ts
type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
```

Unary operations could return the `Result` synchronously or via Promise; stream operations exposed
`AsyncIterable<Result<Item, Err>>`. The Glossary treated unexpected technical failures as outside
the Contract; ADR 0012 left stream-source throws on the iterator’s exceptional channel.

That model was replaced by `InvocationOutcome` (ADR 0015). Glossary, README, ADR 0008, ADR 0012,
and the architectural review were amended together with the implementation.

## Semantic problem

### The Contract does not describe the whole invocation

Given:

```ts
const GetOrder = Orders.intent("getOrder").contract<OrderId, Order, FindOrderError>();
```

the caller sees `FindOrderError` and can handle it exhaustively. The type does not say that the
Promise may reject with:

- a database error;
- a network error;
- an implementation `TypeError`;
- a non-`Error` value thrown by a dependency;
- a failure during Provider materialization;
- any other `unknown`.

The consumer is therefore pushed to write:

```ts
try {
  const result = await getOrder(orderId);
  // Typed handling of FindOrderError.
} catch (cause) {
  // No reliable type-level information.
}
```

That weakens the Contract’s value exactly on the seam between Boundaries.

### The problem belongs to the Boundary, not the Surface

The guarantee must not be a special Surface property. Boundaries cross other Boundaries in private
Composition wiring too. If only the Surface caught throws, a Provider would still need
`try/catch` around every dependency operation.

The property must therefore hold for every operation obtained from an Intent:

```text
Boundary A
  → dependency operation of Boundary B
    → InvocationOutcome, never throw/rejection from B’s implementation
```

The Surface inherits the property because it exposes roots owned by Entry Boundaries; it is not
where the property originates.

## Target protocol

### Expected error

The `expectedError` branch holds only expected errors catalogued in the Contract:

```ts
type FindOrderError =
  | { readonly code: "not_found"; readonly orderId: OrderId }
  | { readonly code: "access_denied" };
```

The caller can interpret them and apply domain recovery:

```ts
switch (outcome.kind) {
  case "expectedError":
    return handleFindOrderError(outcome.error);
}
```

If a condition needs a distinct semantic reaction, that condition must enter `Err`. It must not be
recognized via `instanceof` inside a calling Boundary’s `catch`.

### Unexpected failure

The `unexpectedFailure` branch communicates that the invocation failed for a cause not catalogued in the
Contract:

```ts
type UnexpectedFailure = Readonly<{
  readonly id: FailureId;
}>;
```

The value does not expose:

- `cause`;
- `message`;
- `stack`;
- error class or prototype;
- producer Boundary details;
- input or Params data.

The consumer may:

- propagate the same failure;
- stop its own flow;
- apply a generic policy;
- show the `failureId` as a support reference;
- turn it into a generic host response.

It cannot classify the concrete cause. If that classification is required, it must happen in the
Boundary that owns the integration and must produce an expected error.

### The `cause` does not cross the Boundary

The core uses `cause: unknown` only while converting the exceptional channel into the totalized
protocol. Beyond the Boundary, only `UnexpectedFailure` passes.

This rule prevents details such as `PostgresError`, `RedisError`, `DOMException`, or SDK errors
from becoming accidental dependencies of calling Boundaries.

A Boundary may deliberately observe the cause before it leaves its own implementation — for
example to produce a catalogued diagnostic record. If it uses a logging Intent owned by another
Boundary, the raw `unknown` must not cross that Boundary implicitly: the implementation must first
map it into the diagnostic Contract it chose to expose. Alternatively it may call an SDK local to
the implementation directly.

The privileged Composition hook described below receives the raw cause outside the normal Intent
dataflow. It does not make it available to Providers or other Boundaries.

## Failure identity

### Failure ID as the correlation token of a single failure

The `failureId` identifies a failure, not a request and not an execution context. A request may
have a `traceId` and produce zero or more distinct failures:

```text
trace req-91
└─ Orders
   └─ Inventory
      └─ Redis
         └─ failure fail-42
```

When the failure climbs the graph, it keeps its identity:

```text
Redis creates fail-42
  → Adapter propagates fail-42
    → Inventory propagates fail-42
      → Orders propagates fail-42
        → Surface returns fail-42
```

The rule is:

> Propagating a failure keeps its ID. A new cause generates a new ID.

Parent IDs, `causedBy`, or a failure graph are not introduced initially. Those relations belong to
an observability system, not to Forma’s minimal protocol.

### No registry in the core

Forma does not keep a structure such as:

```ts
Map<FailureId, unknown>;
```

There is therefore no sink to empty or buffer to drain. The token’s lifecycle is that of a normal
immutable value:

1. it is born at the origin;
2. it may be associated with a log;
3. it is propagated inside outcomes;
4. it becomes collectible when no references remain.

Retention of logs, Sentry events, or traces belongs to the respective external systems.

### Factory, not Error class

The recommended form is:

```ts
const failure = createUnexpectedFailure();
```

Not:

```ts
const failure = new UnexpectedFailure();
```

`UnexpectedFailure` is a data token, not an exception. A class would encourage misuse such as
`throw new UnexpectedFailure()` and introduce prototype / `instanceof` semantics that must not
cross Boundaries or remote transports.

The factory lets the core:

- generate an opaque high-entropy ID uniformly;
- apply a nominal brand;
- freeze the descriptor;
- change the internal format later;
- keep a serializable representation.

The Boundary controls the `failureId` in the sense that it can create the token before logging and
reuse its ID. No public factory that accepts arbitrary IDs is proposed. A future remote
integration may have a dedicated, validated primitive to rehydrate an ID received from the
transport.

## Two origin paths

### Explicit failure, owned by the Boundary

An infrastructure Boundary knows the protocol of the library it wraps. It must convert recognized
conditions into expected errors and may take diagnostic ownership of the others:

```ts
try {
  const row = await postgres.query(query);
  return out.success(mapRow(row));
} catch (cause) {
  if (isUniqueViolation(cause)) {
    return out.expectedError({
      code: "unique_violation",
      constraint: cause.constraint,
    });
  }

  return out.unexpectedFailure((failure) =>
    reportUnexpectedFailure({
      failureId: failure.id,
      source: "postgres.insertOrder",
      diagnostic: toDiagnosticRecord(cause),
    })
  );
}
```

The callback overload always returns a Promise. It creates the token before invoking the reporter,
awaits either a synchronous or asynchronous result, ignores the resolved value, and isolates report
throw/rejection. This lets the reporter be an Intent of an Observability Boundary without allowing
diagnostic failure to replace the original failure:

```ts
return out.unexpectedFailure(async (failure) => {
  const reported = await reportUnexpectedFailure({
    failureId: failure.id,
    source: "postgres.insertOrder",
    diagnostic: toDiagnosticRecord(cause),
  });

  if (reported.kind !== "success") {
    console.error("Could not report unexpected failure", failure.id);
  }
});
```

The Boundary created the failure explicitly and owns its reporting. The Composition must not notify
the same origin again, or every failure would be logged twice.

The callback receives only the opaque token. The producing Boundary must map `cause: unknown` to a
censored diagnostic value before passing data to an Observability Boundary; the raw cause still
does not cross the Boundary. A reporting failure never replaces the original failure. Delivery,
fallback, buffering, and retry policy remain application responsibilities.

### Automatic core fallback

A Provider may still contain a bug or let an unforeseen exception escape:

```ts
const Provider = SomeIntent.provide.with(
  () =>
    async function operation() {
      throw new Error("boom");
    }
);
```

Forma must close that channel as well:

```ts
try {
  return await operation(input);
} catch (cause) {
  const failure = createUnexpectedFailure();

  notifyComposition({
    failure,
    cause,
    origin,
    intent,
    phase: "invoke",
  });

  return unexpectedFailure(failure);
}
```

This fallback keeps the protocol correct even when the Boundary did not deliberately handle the
cause. If the Composition configures no hook, Forma discards the raw cause after conversion; it
does not retain it waiting for a future consumer.

## Composition supervision hook

### Motivation

If Forma must simultaneously:

- always contain an escaped throw;
- not propagate the raw cause through the graph;
- not introduce a logging system in the core;

there needs to be an optional point where the host can observe the cause before it is discarded.
The Composition is the coherent place: it owns the graph runtime but is not an application
Boundary.

The hook is not an observability layer. It is a supervision notification for the core fallback
only.

### Name and shape

`onFailure(error, failureId)` is too generic and hard to extend. It could appear to cover expected
errors, cancellation, or dispose as well. The recommended form is:

```ts
compose({
  entryBoundaries: [Orders],
  surface,
  wiring,

  onUnexpectedFailure(event) {
    Sentry.captureException(event.cause, {
      tags: {
        failureId: event.failure.id,
        boundary: event.intent[0],
        intent: event.intent[1],
        phase: event.phase,
      },
    });
  },
});
```

An event object lets metadata evolve without changing the callback arity:

```ts
type UnexpectedFailureEvent = Readonly<{
  readonly failure: UnexpectedFailure;
  readonly cause: unknown;
  readonly intent: IntentIdentity;
  readonly origin: ProviderOrigin;
  readonly phase: "materialize" | "invoke" | "stream-start" | "stream-next";
}>;
```

Input, Params, and partial results are not included automatically, to avoid leaking sensitive
data. An integration may obtain application trace context via closure or `AsyncLocalStorage`
without making that a core responsibility.

### Exact semantics

`onUnexpectedFailure`:

- is called only when Forma automatically creates a failure from a throw/rejection;
- is called once, at the origin;
- is not called for expected errors;
- is not called for a failure created explicitly by the Boundary;
- is not called when an existing failure is propagated;
- does not observe `dispose` or other lifecycle failures;
- does not accumulate events and does not require flush;
- cannot modify the returned `InvocationOutcome`.

This Composition callback — unlike the explicit `out.unexpectedFailure(report)` overload — must be
synchronous and best-effort:

```ts
type OnUnexpectedFailure = (event: UnexpectedFailureEvent) => void;
```

Forma does not await reporting Promises. Awaiting them would introduce latency, backpressure,
failure competition, and a new drain lifecycle in the core. External integrations may
synchronously enqueue the event into their own SDK.

If the hook throws, the runtime must isolate that error: it must not replace the original failure,
reopen the exceptional channel, or recursively invoke the same hook. Diagnostic delivery remains
best-effort.

A nested Composition owns its own hook. There is no process-global observer.

## Infrastructure Boundaries and Adapters

### Catch belongs on the infrastructure Boundary

Forma Adapters connect Boundaries; they do not directly wrap driver exceptions. For example:

```text
Postgres driver
  ↓ may throw
Postgres Boundary
  ↓ InvocationOutcome<Row, PostgresExpectedError>
Postgres → Orders Adapter
  ↓ InvocationOutcome<Order, FindOrderError>
Orders Boundary
```

It is the Postgres Boundary that:

- calls the driver;
- intercepts its exceptions;
- classifies recognized ones into its own `Err`;
- creates an Unexpected Failure for unrecognized ones.

### The Adapter preserves the totalized protocol

The Adapter does not add `try/catch` around the source Intent, because that Intent does not reject
for failures of its own implementation. It maps only the semantically transformable branches:

```ts
switch (sourceOutcome.kind) {
  case "success":
    return out.success(mapRowToOrder(sourceOutcome.value));

  case "expectedError":
    return out.expectedError(mapPostgresError(sourceOutcome.error));

  case "unexpectedFailure":
    return sourceOutcome;

  case "cancelled":
    return sourceOutcome;
}
```

`unexpectedFailure` and `cancelled` keep their identity and are not reinterpreted as expected errors.

Adapter mapping code can still have a bug. A throw produced by the Adapter must be totalized
before entering the target Boundary and generates a new failure, because it is a new cause. The
supervision event keeps the precise `ProviderOrigin`, distinguishing Boundary vs Adapter origin.

## Unary operation

For a unary invocation, Forma must totalize at least:

- synchronous throw during Provider materialization;
- rejection of an async factory;
- synchronous throw of the operation;
- rejection of the Promise returned by the operation;
- mapping throw inside an Adapter;
- Unexpected Failure of a dependency already expressed as `unexpectedFailure`.

The last case does not generate a new failure: when the Provider propagates the received outcome it
must reuse the token, and the wrapper must not replace it. Forma cannot force an application
callback to propagate a result it deliberately ignores; helpers and Adapters should make unchanged
propagation the natural path. The other cases create a new `UnexpectedFailure` where the cause
first enters the totalized protocol.

The caller can therefore use only the Contract:

```ts
const outcome = await getOrder(orderId);

switch (outcome.kind) {
  case "success":
    return renderOrder(outcome.value);

  case "expectedError":
    return renderFindOrderError(outcome.error);

  case "unexpectedFailure":
    return renderGenericFailure(outcome.failure.id);

  case "cancelled":
    return renderCancellation();
}
```

No `try/catch` is needed to defend against the called Boundary’s implementation. Throws from the
caller’s own code after `await`, or from preconditions outside the invocation protocol, remain
possible.

## Stream operation

The same property must hold for streams. The target protocol becomes:

```ts
type StreamOperation<Input, Item, Err> = (
  input: Input,
  invocation: StreamInvocation
) => AsyncIterable<InvocationOutcome<Item, Err>>;
```

Semantics:

- `success` may appear multiple times and represents an item;
- `expectedError` is terminal;
- `unexpectedFailure` is terminal;
- `cancelled` is terminal;
- natural iterator completion is correct stream completion;
- a source throw/rejection during start or `next()` becomes a terminal `unexpectedFailure`, not a
  rejection visible to the consumer.

Example:

```text
success(order-1)
success(order-2)
success(order-3)
unexpectedFailure(fail-42)
done
```

The Composition hook is notified once when the wrapper converts the source throw. Propagating the
terminal item does not produce further events.

Out of scope for this decision:

- an error deliberately passed by the consumer to `iterator.throw(error)`;
- cleanup failure after a consumer `break`;
- rejection of `[Symbol.asyncDispose]()`;
- errors during context/root dispose.

Those cases belong to the consumer protocol or lifecycle and must keep the existing cleanup matrix
until a separate decision changes it.

## Remote Adapter

An `UnexpectedFailure` is serializable without carrying the raw cause:

```json
{
  "kind": "unexpectedFailure",
  "failure": {
    "id": "019a3f5f-02f1-7a31-b4b1-ef9c812cab44"
  }
}
```

The server keeps the local log associated with the same ID. The client may display or report the
ID, but must not depend on server-side error classes, stacks, or driver details.

If the transport fails before a response is received, the client infrastructure Boundary creates a
new local failure. If it receives a valid `unexpectedFailure` from the server, it preserves that ID
instead.

Runtime codecs for `Success`, `Err`, and the wire envelope remain the responsibility of the Remote
Adapter or a package built on top of Forma; they are not added to the core by this change.

## Guarantee boundary

Totalization covers recoverable failures produced during an accepted invocation. It does not turn
Forma into a runtime that can catch every process stop.

| Scenario                                           | Target channel                       |
| -------------------------------------------------- | ------------------------------------ |
| Expected condition declared by the Contract        | `kind: "expectedError"`              |
| Provider factory throws or rejects                 | `kind: "unexpectedFailure"`          |
| Unary operation throws or rejects                  | `kind: "unexpectedFailure"`          |
| Stream source throws during start/next             | terminal `kind: "unexpectedFailure"` |
| Dependency returns an Unexpected Failure           | same failure propagated              |
| Adapter mapping throws                             | new Unexpected Failure               |
| `compose()` receives an invalid configuration      | configuration throw                  |
| Use of an already-disposed root/context            | lifecycle/precondition, out of scope |
| `dispose()` or cleanup fails                       | lifecycle rejection, out of scope    |
| Consumer throws after receiving the outcome        | caller error                         |
| OOM, process termination, or fatal runtime failure | outside guarantees                   |

`dispose()` may therefore continue to reject. It is not a Boundary Contract: it is an ownership
operation observed by the host or supervisor.

## Software-design consequences

### Benefits

- The Contract describes all recoverable outcomes observable across Boundaries.
- Providers do not add defensive `try/catch` on every dependency invocation.
- Expected errors are modeled as data instead of depending on exception classes.
- Unexpected failures keep end-to-end correlation without exposing internal details.
- A Remote Adapter can preserve the same semantics without serializing `unknown`.
- The Composition offers a diagnostic fallback without introducing logging in the core.
- The distinction between domain, unexpected failure, and lifecycle becomes explicit.

### Costs and risks

- It is a breaking change to every operation type and every consumer.
- `Result` and the `ok` / `err` helpers must be replaced or redefined consistently.
- Ignoring an `InvocationOutcome` remains possible: totalization removes hidden rejections; it
  does not force the caller to handle every branch.
- Boundaries that today use throw as control flow must catalogue expected conditions.
- The automatic fallback loses the raw cause if `onUnexpectedFailure` is not configured.
- The supervision hook is best-effort and does not guarantee delivery or flush.
- Streams and cancellation need coordinated migration with already published lifecycle decisions.

## Non-goals

This change does not introduce:

- a Forma logger;
- a diagnostic event bus;
- buffering or retention of failures;
- automatic retry;
- automatic recovery from unexpected failures;
- generic serialization of JavaScript Errors;
- a public Error class hierarchy;
- typed handling of `dispose()` errors;
- a causal graph among failures;
- automatic runtime schemas for Contracts;
- general-purpose middleware or interceptors.

## Invariants to preserve

1. An expected error is always represented by `Err` and can be interpreted by the caller.
2. An unexpected does not expose the raw cause in the dataflow between Boundaries.
3. Every new failure receives exactly one new ID.
4. Propagating a failure keeps object and ID.
5. Automatic conversion notifies the Composition at most once.
6. An explicitly created failure is not notified again by the core.
7. The Composition hook cannot modify or cause the invocation to reject.
8. An Adapter does not turn an unexpected into an expected error.
9. Unary and stream share the same outcome algebra.
10. Lifecycle and configuration remain channels separate from the Boundary Contract.

## Acceptance criteria

### Unary

- synchronous throw and rejection produce `unexpectedFailure` without rejecting the caller;
- factory failure produces `unexpectedFailure` on the invocation that requires materialization;
- the failure ID is branded, immutable, and non-empty;
- a dependency unexpected crosses multiple Boundaries keeping the same ID;
- expected errors of the same name continue to be checked by the Contract;
- the caller can exhaustively handle `InvocationOutcome` without `try/catch`.

### Composition hook

- receives the raw cause and the same failure object returned to the caller;
- is called once for a core-generated failure;
- is not called during propagation;
- is not called for an explicit failure;
- a throwing hook does not change the outcome and does not recurse;
- absence of the hook does not change the invocation result;
- Params and Input are not included in the event.

### Adapter

- expected source error can be mapped to the expected target error;
- unexpected and cancellation are propagated unchanged;
- a mapping throw generates a new unexpected failure;
- the Adapter must not add `catch` around a Forma dependency operation.

### Stream

- source throw before the first item produces a terminal Unexpected Failure;
- source throw after several items produces a single terminal Unexpected Failure;
- Expected Error and Unexpected Failure outcomes are terminal;
- `next()` does not reject for source-implementation failure;
- the Composition hook is called once at the origin;
- early break and dispose keep the current lifecycle matrix.

### Remote

- a remote unexpected keeps the failure ID without rehydrating the cause;
- a local transport failure creates a new ID;
- malformed payloads become local failures of the client infrastructure Boundary;
- the wire payload contains no stack, prototype, or uncatalogued details.

## Documentary impact

Updated atomically with the implementation:

- `GLOSSARY.md`: Contract, InvocationOutcome, Expected Error, Unexpected Failure, Failure ID, and
  stream semantics;
- README: unary, Adapter, surface, and stream examples;
- ADR 0012: source throw as terminal `unexpectedFailure` instead of iterator rejection;
- ADR 0008: relationship between abort/cancellation and `InvocationOutcome`;
- architectural review: superseded “technical failure outside Result”;
- Adapter/demo examples (pass-through `unexpectedFailure` / `cancelled`);
- ADR 0015: normative totalization decision.

This document remains the extended analysis and validation plan; ADR 0015 records the normative
decision in short form.

## Shared decision summary

1. Totalization is a Boundary property; the Surface inherits it.
2. The core converts escaped throws and rejections into `unexpectedFailure` with a failure ID generated
   on the fly.
3. A Boundary may create the failure explicitly, log its ID, and return it.
4. `createUnexpectedFailure()` is preferred over a constructible `UnexpectedFailure` class with
   `new`.
5. The raw cause does not cross the normal dataflow between Boundaries.
6. A propagated failure keeps the same ID; a new cause creates a new ID.
7. Forma keeps no registry, buffer, or diagnostic sink.
8. `onUnexpectedFailure` is an optional Composition hook for automatic core conversions only.
9. The hook is synchronous, best-effort, called once, and unable to alter the outcome.
10. Driver catch belongs on the infrastructure Boundary; the Adapter maps Contracts and propagates
    `unexpectedFailure` outcomes unchanged.
11. Unary and stream must share the same failure protocol.
12. `dispose()` and other lifecycle failures remain rejections outside Boundary Contracts.
