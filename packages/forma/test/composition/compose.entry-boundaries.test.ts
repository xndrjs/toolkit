import { describe, expect, expectTypeOf, it } from "vitest";
import { adapter, boundary, compose, ok } from "@xndrjs/forma";

describe("compose — Entry Boundaries", () => {
  it("accepts the exact set represented by Surface roots and describes it", () => {
    const Orders = boundary("orders");
    const Billing = boundary("billing");
    const GetOrder = Orders.intent("get").contract<void, "order", never>();
    const GetInvoice = Billing.intent("getInvoice").contract<void, "invoice", never>();
    const GetOrderProvider = GetOrder.provide.with(() => () => ok("order" as const));
    const GetInvoiceProvider = GetInvoice.provide.with(() => () => ok("invoice" as const));

    expectTypeOf(GetOrderProvider.origin).toEqualTypeOf<{
      readonly kind: "boundary";
      readonly id: "orders";
    }>();

    const root = compose({
      entryBoundaries: [Orders, Billing],
      surface: { getOrder: GetOrderProvider, getInvoice: GetInvoiceProvider },
    });

    expect(root.describePlan()).toMatchObject({
      entryBoundaries: ["orders", "billing"],
      surface: [
        {
          alias: "getOrder",
          intent: ["orders", "get"],
          origin: { kind: "boundary", id: "orders" },
        },
        {
          alias: "getInvoice",
          intent: ["billing", "getInvoice"],
          origin: { kind: "boundary", id: "billing" },
        },
      ],
    });
    expect(Object.isFrozen(root.describePlan().entryBoundaries)).toBe(true);
    expect(Object.isFrozen(root.describePlan().surface)).toBe(true);
    expect(Object.isFrozen(Orders)).toBe(true);
    expect(Object.isFrozen(Billing)).toBe(true);
  });

  it("rejects a structurally fabricated Entry Boundary", () => {
    const Orders = boundary("orders");
    const GetOrder = Orders.intent("get").contract<void, "order", never>();
    const GetOrderProvider = GetOrder.provide.with(() => () => ok("order" as const));
    const fake = {
      id: "orders",
      intent: Orders.intent,
      stream: Orders.stream,
    };

    expect(() =>
      compose({
        entryBoundaries: [fake],
        surface: { getOrder: GetOrderProvider },
      } as never)
    ).toThrow(/must be Boundary values created by boundary\(\)/);
  });

  it("rejects an Adapter-originated Surface root at type level and runtime", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<void, "order", never>();
    const FindViaAdapter = adapter("orders-memory", Orders)
      .adapt(FindOrder)
      .with(() => () => ok("order" as const));

    expectTypeOf(FindViaAdapter.origin).toEqualTypeOf<{
      readonly kind: "adapter";
      readonly id: "orders-memory";
    }>();

    expect(() =>
      // @ts-expect-error — Adapter-originated Providers cannot be Surface roots
      compose({
        entryBoundaries: [Orders],
        surface: { find: FindViaAdapter },
      })
    ).toThrow(/Adapter Providers cannot be Composition roots/);
  });

  it("rejects a Surface Boundary that was not declared", () => {
    const Orders = boundary("orders");
    const Billing = boundary("billing");
    const GetInvoice = Billing.intent("getInvoice").contract<void, "invoice", never>();
    const GetInvoiceProvider = GetInvoice.provide.with(() => () => ok("invoice" as const));

    expect(() =>
      // @ts-expect-error — billing is not a declared Entry Boundary
      compose({
        entryBoundaries: [Orders],
        surface: { getInvoice: GetInvoiceProvider },
      })
    ).toThrow(/Boundary "billing".*not a declared Entry Boundary/);
  });

  it("rejects a declared Entry Boundary not represented in the Surface", () => {
    const Orders = boundary("orders");
    const Billing = boundary("billing");
    const GetOrder = Orders.intent("get").contract<void, "order", never>();
    const GetOrderProvider = GetOrder.provide.with(() => () => ok("order" as const));

    expect(() =>
      // @ts-expect-error — billing has no Surface root
      compose({
        entryBoundaries: [Orders, Billing],
        surface: { getOrder: GetOrderProvider },
      })
    ).toThrow(/not represented in Surface: billing/);
  });

  it("rejects duplicate canonical Entry Boundary ids", () => {
    const OrdersA = boundary("orders");
    const OrdersB = boundary("orders");
    const GetOrder = OrdersA.intent("get").contract<void, "order", never>();
    const GetOrderProvider = GetOrder.provide.with(() => () => ok("order" as const));

    expect(() =>
      // @ts-expect-error — duplicate Entry Boundary id: orders
      compose({
        entryBoundaries: [OrdersA, OrdersB],
        surface: { getOrder: GetOrderProvider },
      })
    ).toThrow(/Entry Boundary "orders" is declared more than once/);
  });

  it("rejects empty Entry Boundaries and an empty Surface", () => {
    const Orders = boundary("orders");

    expect(() =>
      // @ts-expect-error — Entry Boundaries are a non-empty tuple
      compose({ entryBoundaries: [], surface: {} })
    ).toThrow(/at least one Entry Boundary/);

    expect(() =>
      // @ts-expect-error — Orders is not represented by a Surface root
      compose({ entryBoundaries: [Orders], surface: {} })
    ).toThrow(/not represented in Surface: orders/);
  });
});
