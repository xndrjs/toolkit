import { describe, expect, expectTypeOf, it } from "vitest";
import {
  boundary,
  cancelled,
  createCancellation,
  createUnexpectedFailure,
  expectedError,
  intentIdentity,
  isCancellation,
  isUnexpectedFailure,
  out,
  success,
  unexpectedFailure,
  type InvocationOutcome,
} from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly code: "not_found" };

describe("boundary / intent", () => {
  it("supports intent(name).contract<In, Success, Err>()", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();

    expect(Orders.id).toBe("orders");
    expect(FindOrder.boundaryId).toBe("orders");
    expect(FindOrder.name).toBe("find");
    expect(FindOrder.modality).toBe("unary");
    expect(intentIdentity(FindOrder)).toEqual(["orders", "find"]);
    expect(Object.isFrozen(Orders)).toBe(true);
    expect(Object.isFrozen(FindOrder)).toBe(true);

    const boundarySymbols = Object.getOwnPropertySymbols(Orders);
    const intentSymbols = Object.getOwnPropertySymbols(FindOrder);
    expect(boundarySymbols).toHaveLength(1);
    expect(intentSymbols).toHaveLength(1);
    expect(Object.getOwnPropertyDescriptor(Orders, boundarySymbols[0]!)).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
    expect(Object.getOwnPropertyDescriptor(FindOrder, intentSymbols[0]!)).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
  });

  it("supports stream(name).contract<In, Item, Err>()", () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<OrderId, Order, FindError>();

    expect(WatchOrders.boundaryId).toBe("orders");
    expect(WatchOrders.name).toBe("watchOrders");
    expect(WatchOrders.modality).toBe("stream");
    expect(intentIdentity(WatchOrders)).toEqual(["orders", "watchOrders"]);
  });

  it("requires Intent Expected Errors to expose a finite code discriminant", () => {
    const Orders = boundary("orders");

    Orders.intent("withoutErrors").contract<void, void, never>();
    Orders.intent("catalogued").contract<
      void,
      void,
      { readonly code: "not_found" } | { readonly code: "forbidden" }
    >();

    // @ts-expect-error — Expected Errors are catalogued objects, not primitives
    Orders.intent("primitiveError").contract<void, void, string>();
    // @ts-expect-error — Expected Errors require a code discriminant
    Orders.intent("missingCode").contract<void, void, { readonly message: string }>();
    // @ts-expect-error — an open string cannot be matched exhaustively
    Orders.intent("openCode").contract<void, void, { readonly code: string }>();
    // @ts-expect-error — an empty discriminant should be expressed as Err = never
    Orders.intent("emptyCode").contract<void, void, { readonly code: never }>();
  });

  it("keys Intent identity by structured (boundaryId, intentName)", () => {
    const Orders = boundary("orders");
    const Find = Orders.intent("find").contract<OrderId, Order, FindError>();
    const Get = Orders.intent("get").contract<OrderId, Order, FindError>();

    expect(intentIdentity(Find)).toEqual(["orders", "find"]);
    expect(intentIdentity(Get)).toEqual(["orders", "get"]);
    expect(intentIdentity(Find)).not.toEqual(intentIdentity(Get));
  });

  it("coalesces the same logical Intent across Boundary / declaration instances", () => {
    const OrdersA = boundary("orders");
    const OrdersB = boundary("orders");
    const FindA = OrdersA.intent("find").contract<OrderId, Order, FindError>();
    const FindB = OrdersB.intent("find").contract<OrderId, Order, FindError>();
    const FindAAgain = OrdersA.intent("find").contract<OrderId, Order, FindError>();

    expect(intentIdentity(FindA)).toEqual(intentIdentity(FindB));
    expect(intentIdentity(FindA)).toEqual(intentIdentity(FindAAgain));
    expect(FindA).not.toBe(FindB);
    expect(FindA).not.toBe(FindAAgain);
  });

  it("distinguishes Intent pairs that collide under dotted concat", () => {
    const DotBoundary = boundary("a.b");
    const Plain = boundary("a");
    const FromDot = DotBoundary.intent("c").contract<void, true, never>();
    const FromPlain = Plain.intent("b.c").contract<void, true, never>();

    expect(intentIdentity(FromDot)).toEqual(["a.b", "c"]);
    expect(intentIdentity(FromPlain)).toEqual(["a", "b.c"]);
    expect(intentIdentity(FromDot)).not.toEqual(intentIdentity(FromPlain));
  });
});

describe("Intent type brands", () => {
  it("keeps two same-contract Intents as distinct identities", () => {
    const Orders = boundary("orders");
    // Literal names keep same-contract Intents distinct at the type level.
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    expectTypeOf(FindOrder).not.toEqualTypeOf<typeof GetOrder>();

    // @ts-expect-error — distinct Intent identities are not interchangeable
    const _collapsed: typeof FindOrder = GetOrder;
    void _collapsed;
  });

  it("keeps Intents from different boundaries as distinct brands", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();

    expectTypeOf(FindOrder).not.toEqualTypeOf<typeof SelectOrder>();
    expectTypeOf(FindOrder.boundaryId).toEqualTypeOf<"orders">();
    expectTypeOf(SelectOrder.boundaryId).toEqualTypeOf<"postgres">();

    // @ts-expect-error — cross-boundary brands are not the same Intent type
    const _cross: typeof FindOrder = SelectOrder;
    void _cross;
  });
});

describe("InvocationOutcome", () => {
  it("builds success / expectedError outcomes", () => {
    const okOutcome: InvocationOutcome<Order, FindError> = success({ id: "1", total: 10 });
    const errorOutcome: InvocationOutcome<Order, FindError> = expectedError({ code: "not_found" });

    expect(okOutcome).toEqual({ kind: "success", value: { id: "1", total: 10 } });
    expect(errorOutcome).toEqual({ kind: "expectedError", error: { code: "not_found" } });
    expect(Object.isFrozen(okOutcome)).toBe(false);
    expect(Object.isFrozen(errorOutcome)).toBe(false);
  });

  it("exposes the same constructors on the out namespace", () => {
    const failure = createUnexpectedFailure();
    const cancellation = createCancellation();

    expect(out.success(1)).toEqual(success(1));
    expect(out.expectedError({ code: "not_found" as const })).toEqual(
      expectedError({ code: "not_found" as const })
    );
    expect(out.unexpectedFailure(failure)).toEqual(unexpectedFailure(failure));
    expect(out.cancelled(cancellation)).toEqual(cancelled(cancellation));
    expect(out).not.toHaveProperty("match");
    expect(Object.isFrozen(out)).toBe(true);
  });

  it("injects Contract-scoped out on Provider WithContext", () => {
    const Orders = boundary("orders");
    type ScopedError = { readonly code: "not_found" } | { readonly code: "forbidden" };
    const FindOrder = Orders.intent("find").contract<OrderId, Order, ScopedError>();

    const provider = FindOrder.provide.with(({ out: contractOut }) => {
      expectTypeOf(contractOut.success).parameters.toEqualTypeOf<[Order]>();
      expectTypeOf(contractOut.expectedError).parameters.toEqualTypeOf<[ScopedError]>();
      // @ts-expect-error — the shared constructor namespace is immutable
      contractOut.success = (value) => success(value);

      return function (id) {
        if (id.id === "guest") {
          return contractOut.expectedError({ code: "forbidden" });
        }
        // @ts-expect-error — code must be a ScopedError discriminant
        return contractOut.expectedError({ code: "nope" });
      };
    });

    expect(provider.intent).toBe(FindOrder);
  });

  it("requires out.match handlers for every Expected Error code", () => {
    const Orders = boundary("orders");
    type LookupError =
      | { readonly code: "NO_ROW" }
      | { readonly code: "TIMEOUT"; readonly retryAfterMs: number };
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();

    FindOrder.provide.with(({ out: contractOut }) => {
      const source = null as unknown as InvocationOutcome<Order, LookupError>;

      contractOut.match(source, {
        success: (order) => contractOut.success(order),
        expectedError: {
          NO_ROW: () => contractOut.expectedError({ code: "not_found" }),
          TIMEOUT: () => contractOut.expectedError({ code: "not_found" }),
        },
      });

      contractOut.match(source, {
        success: (order) => contractOut.success(order),
        // @ts-expect-error — every declared source code requires a handler
        expectedError: {
          NO_ROW: () => contractOut.expectedError({ code: "not_found" }),
        },
      });

      return () => contractOut.success({ id: "1", total: 10 });
    });
  });

  it("types success and expectedError discriminants", () => {
    const okOutcome = success(42);
    const errorOutcome = expectedError("boom");

    expectTypeOf(okOutcome).toEqualTypeOf<InvocationOutcome<number, never>>();
    expectTypeOf(errorOutcome).toEqualTypeOf<InvocationOutcome<never, string>>();

    if (okOutcome.kind === "success") {
      expectTypeOf(okOutcome.value).toEqualTypeOf<number>();
    }
    if (errorOutcome.kind === "expectedError") {
      expectTypeOf(errorOutcome.error).toEqualTypeOf<string>();
    }
  });

  it("createUnexpectedFailure yields a branded frozen token with a non-empty id", () => {
    const failure = createUnexpectedFailure();
    expect(Object.isFrozen(failure)).toBe(true);
    expect(typeof failure.id).toBe("string");
    expect(failure.id.length).toBeGreaterThan(0);
    expect(isUnexpectedFailure(failure)).toBe(true);
    expect(isUnexpectedFailure({ id: failure.id })).toBe(false);

    const outcome = unexpectedFailure(failure);
    expect(outcome).toEqual({ kind: "unexpectedFailure", failure });
    expect(Object.isFrozen(outcome)).toBe(false);
    expect(outcome.kind).toBe("unexpectedFailure");
    if (outcome.kind === "unexpectedFailure") {
      expect(outcome.failure).toBe(failure);
    }
  });

  it("unexpectedFailure() creates and wraps a token in one step", () => {
    const outcome = unexpectedFailure();
    expect(outcome.kind).toBe("unexpectedFailure");
    if (outcome.kind === "unexpectedFailure") {
      expect(isUnexpectedFailure(outcome.failure)).toBe(true);
    }
  });

  it("unexpectedFailure(report) always returns a Promise and awaits the reporter", async () => {
    const seen: string[] = [];
    const outcomePromise = unexpectedFailure(async (failure) => {
      seen.push(failure.id);
      await Promise.resolve();
      seen.push(`reported:${failure.id}`);
    });
    expectTypeOf(outcomePromise).toEqualTypeOf<Promise<InvocationOutcome<never, never>>>();
    expect(outcomePromise).toBeInstanceOf(Promise);

    const outcome = await outcomePromise;
    expect(outcome.kind).toBe("unexpectedFailure");
    if (outcome.kind === "unexpectedFailure") {
      expect(seen).toEqual([outcome.failure.id, `reported:${outcome.failure.id}`]);
      expect(isUnexpectedFailure(outcome.failure)).toBe(true);
    }
  });

  it("unexpectedFailure(report) preserves its failure when reporting throws or rejects", async () => {
    const syncSeen: string[] = [];
    const syncOutcome = await unexpectedFailure((failure) => {
      syncSeen.push(failure.id);
      throw new Error("sync report failed");
    });
    expect(syncOutcome.kind).toBe("unexpectedFailure");
    if (syncOutcome.kind === "unexpectedFailure") {
      expect(syncSeen).toEqual([syncOutcome.failure.id]);
    }

    const asyncSeen: string[] = [];
    const asyncOutcome = await unexpectedFailure(async (failure) => {
      asyncSeen.push(failure.id);
      await Promise.resolve();
      throw new Error("async report failed");
    });
    expect(asyncOutcome.kind).toBe("unexpectedFailure");
    if (asyncOutcome.kind === "unexpectedFailure") {
      expect(asyncSeen).toEqual([asyncOutcome.failure.id]);
    }
  });

  it("createCancellation yields a branded frozen token for the cancelled branch", () => {
    const cancellation = createCancellation();
    expect(Object.isFrozen(cancellation)).toBe(true);
    expect(isCancellation(cancellation)).toBe(true);
    expect(isCancellation({})).toBe(false);

    const outcome = cancelled(cancellation);
    expect(outcome).toEqual({ kind: "cancelled", cancellation });
    expect(Object.isFrozen(outcome)).toBe(false);
    expect(outcome.kind).toBe("cancelled");
    if (outcome.kind === "cancelled") {
      expect(outcome.cancellation).toBe(cancellation);
    }
  });
});
