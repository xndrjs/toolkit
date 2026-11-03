import { describe, expect, expectTypeOf, it } from "vitest";
import { adapter } from "@xndrjs/forma";
import { boundary } from "@xndrjs/forma";
import { compose } from "@xndrjs/forma";
import { expectedError, success, type InvocationOutcome } from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly code: "not_found" };

describe("adapter", () => {
  it("rejects a structurally fabricated target Boundary", () => {
    const fake = {
      id: "orders",
      intent: () => undefined,
      stream: () => undefined,
    };

    expect(() => adapter("orders-fake", fake as never)).toThrow(
      /target must be a Boundary value created by boundary\(\)/
    );

    const Orders = boundary("orders");
    const spread = { ...Orders };
    expect(Object.getOwnPropertySymbols(spread)).toEqual([]);
    expect(() => adapter("orders-spread", spread)).toThrow(
      /target must be a Boundary value created by boundary\(\)/
    );
  });

  it("same-boundary Intent.provide builds a boundary-origin provider", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    expect(GetOrderProvider.intent).toBe(GetOrder);
    expect(GetOrderProvider.deps).toEqual({ find: FindOrder });
    expect(GetOrderProvider.origin).toEqual({ kind: "boundary", id: "orders" });
  });

  it("rejects cross-boundary Intents in Intent.provide.using", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    // @ts-expect-error — using only accepts Intents of the same boundary brand
    GetOrder.provide.using({ find: SelectOrder });

    void FindOrder;
  });

  it("adapt allows a single cross-boundary using dep and sets adapter origin", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();

    const OrdersPostgres = adapter("orders-postgres", Orders);
    const FindViaPostgres = OrdersPostgres.adapt(FindOrder)
      .using({ select: SelectOrder })
      .with(
        ({ deps: { select } }) =>
          function (id) {
            return select(id);
          }
      );

    expect(OrdersPostgres.id).toBe("orders-postgres");
    expect(OrdersPostgres.target).toBe(Orders);
    expect(FindViaPostgres.intent).toBe(FindOrder);
    expect(FindViaPostgres.deps).toEqual({ select: SelectOrder });
    expect(FindViaPostgres.origin).toEqual({ kind: "adapter", id: "orders-postgres" });
    expect(FindViaPostgres.lifetimePolicy).toBe("auto");
  });

  it("adapt allows multi-boundary using deps", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const Cache = boundary("cache");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();
    const CacheGet = Cache.intent("get").contract<OrderId, Order | null, never>();

    const FindViaInfra = adapter("orders-infra", Orders)
      .adapt(FindOrder)
      .using({ select: SelectOrder, cache: CacheGet })
      .with(({ deps: { select, cache } }) => {
        expectTypeOf(select).toEqualTypeOf<
          (
            input: OrderId
          ) => InvocationOutcome<Order, FindError> | Promise<InvocationOutcome<Order, FindError>>
        >();
        expectTypeOf(cache).toEqualTypeOf<
          (
            input: OrderId
          ) =>
            | InvocationOutcome<Order | null, never>
            | Promise<InvocationOutcome<Order | null, never>>
        >();
        return async function (id) {
          const cached = await cache(id);
          if (cached.kind !== "success") {
            return cached;
          }
          if (cached.value !== null) {
            return success(cached.value);
          }
          return select(id);
        };
      });

    expect(FindViaInfra.deps).toEqual({ select: SelectOrder, cache: CacheGet });
    expect(FindViaInfra.origin).toEqual({ kind: "adapter", id: "orders-infra" });
  });

  it("compose resolves an adapter provider for a required Intent (no intent alias)", async () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();

    const SelectOrderProvider = SelectOrder.provide.with(
      (_ctx) =>
        function (id) {
          return id.id === "42"
            ? success({ id: "42", total: 100 })
            : expectedError({ code: "not_found" as const });
        }
    );

    const FindOrderAdapter = adapter("orders-postgres", Orders)
      .adapt(FindOrder)
      .using({ select: SelectOrder })
      .with(
        ({ deps: { select } }) =>
          function (id) {
            return select(id);
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
      wiring: [SelectOrderProvider, FindOrderAdapter],
    });

    const ctx = root.openExecutionContext();
    expect(ctx).not.toHaveProperty("findOrder");
    expect(ctx).not.toHaveProperty("selectOrder");

    const hit = await ctx.surface.getOrder({ id: "42" });
    expect(hit).toEqual({ kind: "success", value: { id: "42", total: 100 } });

    const miss = await ctx.surface.getOrder({ id: "missing" });
    expect(miss).toEqual({ kind: "error", error: { code: "not_found" } });

    await expect(ctx.dispose()).resolves.toBeUndefined();
    await expect(root.dispose()).resolves.toBeUndefined();
  });

  it("adapt preserves the target Intent contract while mapping foreign shapes", async () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");

    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    type PgRowId = { readonly orderId: string };
    type PgRow = { readonly order_id: string; readonly amount_cents: number };
    type PgSelectError = { readonly code: "NO_ROW" };
    const SelectOrder = Postgres.intent("selectOrder").contract<PgRowId, PgRow, PgSelectError>();

    const SelectOrderProvider = SelectOrder.provide.with(
      (_ctx) =>
        function (input) {
          return input.orderId === "7"
            ? success({ order_id: "7", amount_cents: 2500 })
            : expectedError({ code: "NO_ROW" as const });
        }
    );

    const FindOrderAdapter = adapter("orders-postgres", Orders)
      .adapt(FindOrder)
      .using({ select: SelectOrder })
      .with(
        ({ deps: { select } }) =>
          async function (id) {
            const row = await select({ orderId: id.id });
            switch (row.kind) {
              case "success":
                return success({ id: row.value.order_id, total: row.value.amount_cents / 100 });
              case "error":
                return expectedError({ code: "not_found" as const });
              case "unexpected":
              case "cancelled":
                return row;
            }
          }
      );

    expect(FindOrderAdapter.intent).toBe(FindOrder);

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: [SelectOrderProvider, FindOrderAdapter],
    });

    const ctx = root.openExecutionContext();
    const result: InvocationOutcome<Order, FindError> = await ctx.surface.getOrder({ id: "7" });
    expect(result).toEqual({ kind: "success", value: { id: "7", total: 25 } });

    const miss: InvocationOutcome<Order, FindError> = await ctx.surface.getOrder({ id: "none" });
    expect(miss).toEqual({ kind: "error", error: { code: "not_found" } });

    await ctx.dispose();
    await root.dispose();
  });

  it("perContext adapter dispose runs on ctx.dispose()", async () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();

    const SelectOrderProvider = SelectOrder.provide.with(
      (_ctx) =>
        function (id) {
          return success({ id: id.id, total: 1 });
        }
    );

    const stub = { disposed: false };
    const FindOrderAdapter = adapter("orders-postgres", Orders)
      .adapt(FindOrder)
      .using({ select: SelectOrder })
      .perContext()
      .with(({ deps: { select }, lifetime }) => {
        lifetime.onDispose(async () => {
          stub.disposed = true;
        });
        return function (id) {
          return select(id);
        };
      });

    expect(FindOrderAdapter.lifetimePolicy).toBe("context");
    expect(FindOrderAdapter.origin).toEqual({ kind: "adapter", id: "orders-postgres" });

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { get: GetOrderProvider },
      wiring: [SelectOrderProvider, FindOrderAdapter],
    });
    const ctx = root.openExecutionContext();

    await ctx.surface.get({ id: "1" });
    expect(stub.disposed).toBe(false);

    await ctx.dispose();
    expect(stub.disposed).toBe(true);

    await root.dispose();
  });

  it("throws when the same Intent has competing boundary and adapter realizations", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const Ready = Orders.intent("ready").contract<void, true, never>();

    const FindOrderProvider = FindOrder.provide.with(
      (_ctx) =>
        function (id) {
          return success({ id: id.id, total: 1 });
        }
    );
    const FindOrderAdapter = adapter("orders-postgres", Orders)
      .adapt(FindOrder)
      .with(
        (_ctx) =>
          function (id) {
            return success({ id: id.id, total: 2 });
          }
      );
    const ReadyProvider = Ready.provide.with(
      (_ctx) =>
        function () {
          return success(true as const);
        }
    );

    expect(() =>
      compose({
        entryBoundaries: [Orders],
        surface: { ready: ReadyProvider },
        wiring: [FindOrderProvider, FindOrderAdapter],
      })
    ).toThrow(/is registered more than once in wiring/);
  });

  it("type-rejects adapt of an Intent from a non-target boundary", () => {
    const Orders = boundary("orders");
    const Billing = boundary("billing");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const Charge = Billing.intent("charge").contract<OrderId, void, never>();

    const OrdersPostgres = adapter("orders-postgres", Orders);
    // @ts-expect-error — adapt only accepts Intents of the target boundary
    OrdersPostgres.adapt(Charge);

    void FindOrder;
  });
});
