import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose } from "./compose.js";
import { ok, type Result } from "./result.js";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

describe("compose — implicit using graph", () => {
  it("resolves a same-boundary using dep from wiring by Intent identity", async () => {
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
      wiring: [FindOrderProvider],
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

  it("throws at compose when wiring omits the required Intent's provider", () => {
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

    // Compile-time also rejects this; runtime closed-graph check fires at compose.
    expect(() =>
      // @ts-expect-error — Missing provider for Intent(s): orders.find
      compose({
        surface: { getOrder: GetOrderProvider },
        // FindOrderProvider intentionally omitted
      })
    ).toThrow(/No provider registered for Intent orders\.find/);
  });
});
