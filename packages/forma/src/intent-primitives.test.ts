import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { err, ok, type Result } from "./result.js";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

describe("boundary / intent", () => {
  it("supports the plan call form intent<In, Success, Err>(name)", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent<OrderId, Order, FindError>("find");

    expect(Orders.id).toBe("orders");
    expect(FindOrder.boundaryId).toBe("orders");
    expect(FindOrder.name).toBe("find");
    expect(typeof FindOrder.identity).toBe("symbol");
  });

  it("gives each Intent a distinct runtime identity", () => {
    const Orders = boundary("orders");
    const Find = Orders.intent<OrderId, Order, FindError>("find");
    const Get = Orders.intent<OrderId, Order, FindError>("get");

    expect(Find.identity).not.toBe(Get.identity);
  });
});

describe("Intent type brands", () => {
  it("keeps two same-contract Intents as distinct identities", () => {
    const Orders = boundary("orders");
    // Curried form preserves literal names so identities stay distinct at the type level.
    const FindOrder = Orders.intent<OrderId, Order, FindError>()("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>()("get");

    expectTypeOf(FindOrder).not.toEqualTypeOf<typeof GetOrder>();

    // @ts-expect-error — distinct Intent identities are not interchangeable
    const _collapsed: typeof FindOrder = GetOrder;
    void _collapsed;
  });

  it("keeps Intents from different boundaries as distinct brands", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent<OrderId, Order, FindError>("find");
    const SelectOrder = Postgres.intent<OrderId, Order, FindError>("selectOrder");

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
