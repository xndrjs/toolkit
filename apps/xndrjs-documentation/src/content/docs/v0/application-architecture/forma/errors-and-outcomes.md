---
title: Errors and outcomes
description: Handle expected errors as Contract data while Forma censors unexpected causes at every Boundary exit.
---

An Intent Contract cannot be complete if callers must also guess which exceptions its Promise may
reject with. TypeScript does not describe rejected Promise values, so a typed result plus an
untyped exceptional channel would force every calling Boundary to know two protocols.

Forma makes the Boundary exit total instead.

## The InvocationOutcome protocol

Every unary Intent returns one `InvocationOutcome<Success, ExpectedError>`. Every stream Intent
emits the same algebra with `Success` interpreted as its item type.

```ts
type InvocationOutcome<Success, ExpectedError> =
  | { readonly kind: "success"; readonly value: Success }
  | { readonly kind: "expectedError"; readonly error: ExpectedError }
  | {
      readonly kind: "unexpectedFailure";
      readonly failure: UnexpectedFailure;
    }
  | { readonly kind: "cancelled"; readonly cancellation: Cancellation };
```

| Kind                | Meaning                                           | What a caller may do                                     |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------- |
| `success`           | Contract succeeded                                | Use the typed value                                      |
| `expectedError`     | Catalogued failure from the Contract's `Err` type | Interpret it and recover semantically                    |
| `unexpectedFailure` | An uncatalogued cause occurred at some origin     | Propagate it or apply generic policy using its opaque id |
| `cancelled`         | Cancellation represented as Intent data           | Propagate or handle cancellation generically             |

The envelope is readonly in TypeScript but is not frozen at runtime. Forma owns the protocol; value
immutability remains an application concern.

## Expected Error is part of the Contract

If callers need to make a distinct decision for a failure, put it in the Intent's expected-error
type:

```ts
type GetOrderDetailsError = { readonly code: "not_found" } | { readonly code: "forbidden" };

const GetOrderDetailsUseCase = Orders.intent("getOrderDetailsUseCase").contract<
  OrderId,
  Order,
  GetOrderDetailsError
>();
```

An Intent's Expected Error type must be `never` or an object union whose `code` is a finite set of
string literals. `code` discriminates catalogued errors; `kind` remains reserved for the four
`InvocationOutcome` branches.

Providers construct it with their Contract-scoped `out`:

```ts
return out.expectedError({ code: "forbidden" });
```

This is the only failure branch another Boundary may interpret semantically. The principle is:

> Handleable failure means failure catalogued in the Contract.

## Unexpected causes stop at their origin

If Provider materialization or invocation throws or rejects, Forma catches it at the originating
Boundary or Adapter and creates an opaque token:

```ts
type UnexpectedFailure = Readonly<{
  readonly id: FailureId;
}>;
```

The token does not carry a message, stack, input, Params, producer detail, or raw cause. A calling
Boundary cannot recover by inspecting implementation details that were never part of the Contract.

Automatic totalization covers these phases:

- Provider materialization;
- unary invocation;
- stream start;
- stream `next()`.

The same failure object and id pass through subsequent Boundary and Adapter calls. A new cause
creates a new failure id. Forma does not keep a global registry from ids to causes.

## Observe automatic conversions at the Composition

The Composition may install a synchronous, best-effort diagnostic hook:

```ts
const root = compose({
  entryBoundaries: [Orders],
  surface: { getOrderDetails: GetOrderDetailsProvider },
  wiring: [FindOrderByIdProvider],
  onUnexpectedFailure(event) {
    console.error({
      failureId: event.failure.id,
      cause: event.cause,
      intent: event.intent,
      origin: event.origin,
      phase: event.phase,
    });
  },
});
```

`event.cause` is available only to this host diagnostic channel. It never enters the normal Intent
dataflow.

The hook is called once at the origin for automatic core conversions. It is not called for:

- Expected Errors;
- failures explicitly created by application code;
- a failure propagated from another operation;
- lifecycle or disposal failures.

The hook is synchronous: Forma ignores returned Promises and isolates hook throws. If omitted, the
default hook sends the event to `console.error`.

## Create an explicit Unexpected Failure

A Boundary sometimes detects an unexpected condition without receiving a thrown cause—for example,
an undocumented external error code or a valid payload with impossible semantics.

Create a failure directly:

```ts
return out.unexpectedFailure();
```

When the Boundary must correlate censored diagnostics with the token, pass an awaitable reporter:

```ts
return out.unexpectedFailure(async (failure) => {
  await reportFailure({
    failureId: failure.id,
    source: "sqlite.selectOrder",
    diagnostic: { externalCode },
  });
});
```

The reporter receives the newly created token, may call an asynchronous observability system or
Intent, and is awaited before returning the outcome. Its resolved value is ignored. If reporting
throws or rejects, Forma preserves the original Unexpected Failure instead of replacing it.

This explicit path does not trigger `onUnexpectedFailure`: the Boundary already owns diagnosis and
reporting.

If ownership must be split manually, create the token first:

```ts
import { createUnexpectedFailure } from "@xndrjs/forma";

const failure = createUnexpectedFailure();
try {
  await reportFailure({ failureId: failure.id });
} catch (reportCause) {
  // This explicit form makes the Boundary responsible for reporting failure policy.
  console.error("Unable to report failure", reportCause);
}
return out.unexpectedFailure(failure);
```

## Translate dependency outcomes with `out.match`

An Adapter maps success and Expected Error into the target Boundary's language. Unexpected Failure
and Cancellation pass through unchanged. The Contract-scoped matcher makes that distinction
explicit without repeating the terminal branches:

```ts
return out.match(outcome, {
  success: (row) => out.success(mapRow(row)),
  expectedError: {
    NO_ROW: () => out.expectedError({ code: "not_found" }),
    TIMEOUT: (error) =>
      out.expectedError({
        code: "temporarily_unavailable",
        retryAfterMs: error.retryAfterMs,
      }),
  },
});
```

The `success` handler is required. If the source Contract declares Expected Errors, the
`expectedError` map is also required and exhaustive over their codes; each handler receives the
corresponding narrowed payload. Handlers may return their outcome synchronously or asynchronously.
`unexpectedFailure` and `cancelled` need no handlers because their original tokens propagate
unchanged.

The static check covers the declared Contract. If runtime drift produces an undeclared Expected
Error code, `out.match` fails internally and the enclosing invocation totalizes it as a new
`unexpectedFailure`, attributed to the Provider or Adapter performing the translation. The raw
payload remains local to diagnostics as the match error's `cause`; callers receive only the opaque
failure token.

Matching is available on the `ctx.out` injected into `.with`, where the target Contract and
invocation origin are known. The open-generic module-level `out` exposes constructors only.

Do not wrap Forma dependency operations in defensive `try/catch` to discover implementation
failures: the dependency Boundary already totalized them.

An infrastructure Boundary may still catch a driver or vendor exception when it has enough local
knowledge to classify the condition as an Expected Error or to report censored diagnostics. That
classification belongs at the infrastructure Boundary, not in the Adapter between two already
totalized Intent operations.

## Streams use the same protocol

Streams may emit many `success` items. The other three kinds are terminal. A source throw during
start or iteration becomes one terminal `unexpectedFailure` event instead of rejecting `next()`.

For explicit reporting inside a stream, await the reporter before yielding:

```ts
yield await out.unexpectedFailure(async (failure) => {
  await reportFailure({ failureId: failure.id, source: "orders.watch" });
});
```

No explicit `return` is required after a terminal yield. The managed stream wrapper closes the
source before requesting another event.

Natural iterator completion is a successful end and does not require a terminal event.

## Cancellation and lifecycle remain distinct

`cancelled` allows an Intent or Adapter to carry cancellation as data. It does not currently encode
every host-abort path:

- rejection caused by refusing new work after host abort remains an acceptance channel;
- cooperative cancellation is observed through `AbortSignal`;
- cleanup and `dispose()` failures reject their lifecycle Promise.

Lifecycle failures are not failures produced by an Intent Contract. Turning them into
`unexpectedFailure` would hide failures while the system is relinquishing ownership rather than
executing a Boundary operation.

Continue with [Streaming](/v0/application-architecture/forma/streaming/) for terminal events,
source totalization, cancellation, and cleanup ownership across an AsyncIterable.
