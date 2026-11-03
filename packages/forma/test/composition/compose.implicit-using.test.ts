import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "@xndrjs/forma";
import { compose } from "@xndrjs/forma";
import { success, type InvocationOutcome } from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly code: "not_found" };

describe("compose — implicit using graph", () => {
  it("resolves a same-boundary using dep from wiring by Intent identity", async () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    const FindOrderProvider = FindOrder.provide.with(
      (_ctx) =>
        function (id) {
          return id.id === "1" ? success({ id: "1", total: 42 }) : success({ id: id.id, total: 0 });
        }
    );

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: [FindOrderProvider],
    });

    const ctx = root.openExecutionContext();

    expect(typeof ctx.surface.getOrder).toBe("function");
    expect(ctx).not.toHaveProperty("findOrder");
    expectTypeOf(ctx).not.toHaveProperty("findOrder");
    expectTypeOf(ctx.surface.getOrder).toEqualTypeOf<
      (input: OrderId) => Promise<InvocationOutcome<Order, FindError>>
    >();

    const result = await ctx.surface.getOrder({ id: "1" });
    expect(result).toEqual({ kind: "success", value: { id: "1", total: 42 } });

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
        entryBoundaries: [Orders],
        surface: { getOrder: GetOrderProvider },
        // FindOrderProvider intentionally omitted
      })
    ).toThrow(/No provider registered for Intent orders\.find/);
  });
});
