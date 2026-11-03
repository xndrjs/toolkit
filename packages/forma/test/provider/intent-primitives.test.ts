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
    expect(errorOutcome).toEqual({ kind: "error", error: { code: "not_found" } });
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
  });

  it("injects Contract-scoped out on Provider WithContext", () => {
    const Orders = boundary("orders");
    type ScopedError = { readonly code: "not_found" } | { readonly code: "forbidden" };
    const FindOrder = Orders.intent("find").contract<OrderId, Order, ScopedError>();

    const provider = FindOrder.provide.with(({ out: contractOut }) => {
      expectTypeOf(contractOut.success).parameters.toEqualTypeOf<[Order]>();
      expectTypeOf(contractOut.expectedError).parameters.toEqualTypeOf<[ScopedError]>();

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

  it("types success and expectedError discriminants", () => {
    const okOutcome = success(42);
    const errorOutcome = expectedError("boom");

    expectTypeOf(okOutcome).toEqualTypeOf<InvocationOutcome<number, never>>();
    expectTypeOf(errorOutcome).toEqualTypeOf<InvocationOutcome<never, string>>();

    if (okOutcome.kind === "success") {
      expectTypeOf(okOutcome.value).toEqualTypeOf<number>();
    }
    if (errorOutcome.kind === "error") {
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
    expect(outcome).toEqual({ kind: "unexpected", failure });
    expect(outcome.kind).toBe("unexpected");
    if (outcome.kind === "unexpected") {
      expect(outcome.failure).toBe(failure);
    }
  });

  it("createCancellation yields a branded frozen token for the cancelled branch", () => {
    const cancellation = createCancellation();
    expect(Object.isFrozen(cancellation)).toBe(true);
    expect(isCancellation(cancellation)).toBe(true);
    expect(isCancellation({})).toBe(false);

    const outcome = cancelled(cancellation);
    expect(outcome).toEqual({ kind: "cancelled", cancellation });
    expect(outcome.kind).toBe("cancelled");
    if (outcome.kind === "cancelled") {
      expect(outcome.cancellation).toBe(cancellation);
    }
  });
});
