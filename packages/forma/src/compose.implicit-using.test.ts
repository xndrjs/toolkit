import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose } from "./compose.js";
import { ok, type Result } from "./result.js";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

describe("compose — implicit using graph", () => {
  it("resolves a same-boundary using dep from private providers by Intent identity", async () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent<OrderId, Order, FindError>("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>("get");

    const FindOrderProvider = FindOrder.provide.with((id) =>
      id.id === "1" ? ok({ id: "1", total: 42 }) : ok({ id: id.id, total: 0 })
    );

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ find }) =>
        (id) =>
          find(id)
    );

    const root = compose({
      surface: { getOrder: GetOrderProvider },
      providers: [FindOrderProvider],
    });

    const ctx = root.createExecutionContext();

    expect(typeof ctx.getOrder).toBe("function");
    expect(ctx).not.toHaveProperty("findOrder");
    expectTypeOf(ctx).not.toHaveProperty("findOrder");
    expectTypeOf(ctx.getOrder).toEqualTypeOf<
      (input: OrderId) => Result<Order, FindError> | Promise<Result<Order, FindError>>
    >();

    const result = await ctx.getOrder({ id: "1" });
    expect(result).toEqual({ ok: true, value: { id: "1", total: 42 } });

    await expect(ctx.dispose()).resolves.toBeUndefined();
  });

  it("throws at runtime when providers omits the required Intent's provider", async () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent<OrderId, Order, FindError>("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>("get");

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ find }) =>
        (id) =>
          find(id)
    );

    const root = compose({
      surface: { getOrder: GetOrderProvider },
      // FindOrderProvider intentionally omitted
    });

    const ctx = root.createExecutionContext();
    expect(() => ctx.getOrder({ id: "1" })).toThrow(
      /No provider registered for Intent orders\.find/
    );
  });
});
