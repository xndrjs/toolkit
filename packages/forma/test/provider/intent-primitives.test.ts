import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary, intentIdentity } from "@xndrjs/forma";
import { err, ok, type Result } from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

describe("boundary / intent", () => {
  it("supports intent(name).contract<In, Success, Err>()", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();

    expect(Orders.id).toBe("orders");
    expect(FindOrder.boundaryId).toBe("orders");
    expect(FindOrder.name).toBe("find");
    expect(intentIdentity(FindOrder)).toEqual(["orders", "find"]);
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

describe("Result", () => {
  it("builds ok / err outcomes", () => {
    const success: Result<Order, FindError> = ok({ id: "1", total: 10 });
    const failure: Result<Order, FindError> = err({ kind: "not_found" });

    expect(success).toEqual({ ok: true, value: { id: "1", total: 10 } });
    expect(failure).toEqual({ ok: false, error: { kind: "not_found" } });
  });

  it("types ok and err discriminants", () => {
    const success = ok(42);
    const failure = err("boom");

    expectTypeOf(success).toEqualTypeOf<Result<number, never>>();
    expectTypeOf(failure).toEqualTypeOf<Result<never, string>>();

    if (success.ok) {
      expectTypeOf(success.value).toEqualTypeOf<number>();
    }
    if (!failure.ok) {
      expectTypeOf(failure.error).toEqualTypeOf<string>();
    }
  });
});
