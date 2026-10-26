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
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    const FindOrderProvider = FindOrder.provide.with(
      (_ctx) =>
        function (id) {
          return id.id === "1" ? ok({ id: "1", total: 42 }) : ok({ id: id.id, total: 0 });
        }
    );

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
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
      (input: OrderId) => Promise<Result<Order, FindError>>
    >();

    const result = await ctx.getOrder({ id: "1" });
    expect(result).toEqual({ ok: true, value: { id: "1", total: 42 } });

    await expect(ctx.dispose()).resolves.toBeUndefined();
  });

  it("throws at runtime when providers omits the required Intent's provider", async () => {
    // Literal intent names so the compose type bar applies (orders.find ≠ orders.get).
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    // Compile-time also rejects this (ticket 07); assert runtime defense-in-depth.
    // @ts-expect-error — Missing provider for Intent(s): orders.find
    const root = compose({
      surface: { getOrder: GetOrderProvider },
      // FindOrderProvider intentionally omitted
    });

    const ctx = root.createExecutionContext();
    await expect(ctx.getOrder({ id: "1" })).rejects.toThrow(
      /No provider registered for Intent orders\.find/
    );
  });
});
