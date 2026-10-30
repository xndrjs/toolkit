import { describe, expect, expectTypeOf, it } from "vitest";
import { adapter } from "@xndrjs/forma";
import { boundary } from "@xndrjs/forma";
import { compose } from "@xndrjs/forma";
import { err, ok, type Result } from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };
type CancelError = { readonly kind: "already_cancelled" };

describe("provider builder", () => {
  it("builds a no-deps provider with lifetime in with", async () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();

    const PingProvider = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong");
        }
    );

    expect(PingProvider.intent).toBe(Ping);
    expect(PingProvider.deps).toEqual({});
    expect(PingProvider.lifetimePolicy).toBe("auto");
    expect(PingProvider.origin).toEqual({ kind: "boundary", id: "health" });
    expect(Object.isFrozen(PingProvider)).toBe(true);
    expect(Object.isFrozen(PingProvider.origin)).toBe(true);
    expect(Object.isFrozen(PingProvider.deps)).toBe(true);
    expect(Object.isFrozen(PingProvider.intent)).toBe(true);
    expect(Object.isFrozen(Ping.provide)).toBe(true);
    expect(Object.isFrozen(Health.intent)).toBe(true);
    expect(Object.isFrozen(Health.intent("other"))).toBe(true);
    expect(PingProvider).not.toHaveProperty("factory");
    expect(PingProvider).not.toHaveProperty("$params");
    expect(Object.keys(PingProvider)).toEqual(["intent", "deps", "lifetimePolicy", "origin"]);

    // @ts-expect-error — realization is internal Provider machinery
    void PingProvider.factory;
    // @ts-expect-error — Params inference is carried by a private nominal brand
    void PingProvider.$params;

    const structuralFake = {
      intent: Ping,
      deps: {},
      lifetimePolicy: "auto" as const,
      origin: { kind: "boundary" as const, id: "health" },
    };
    // @ts-expect-error — Provider cannot be constructed structurally
    const nominalProvider: typeof PingProvider = structuralFake;
    void nominalProvider;

    const root = compose({
      entryBoundaries: [Health],
      surface: { ping: PingProvider },
    });
    await using ctx = root.openExecutionContext();
    await expect(ctx.surface.ping()).resolves.toEqual({ ok: true, value: "pong" });
  });

  it("rejects a structurally fabricated Provider at runtime", () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(() => () => ok("pong" as const));
    const fake = {
      intent: Ping,
      deps: {},
      lifetimePolicy: "auto",
      origin: { kind: "boundary", id: "health" },
    };

    expect(() =>
      compose({
        entryBoundaries: [Health],
        surface: { ping: fake },
      } as never)
    ).toThrow(/must use a Provider value created by Forma/);

    expect(() =>
      compose({
        entryBoundaries: [Health],
        surface: { ping: PingProvider },
        wiring: [fake],
      } as never)
    ).toThrow(/Invalid wiring entry: expected a Provider/);
  });

  it("runs no-deps with at materialization and exposes Lifetime", async () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();

    let setups = 0;
    let disposed = false;
    const FindProvider = FindOrder.provide.with(({ lifetime }) => {
      setups += 1;
      lifetime.onDispose(() => {
        disposed = true;
      });
      const cache = new Map<string, Order>();
      return function (id: OrderId) {
        const hit = cache.get(id.id);
        if (hit) {
          return ok(hit);
        }
        const order = { id: id.id, total: 10 };
        cache.set(id.id, order);
        return ok(order);
      };
    });

    const root = compose({
      entryBoundaries: [Orders],
      surface: { find: FindProvider },
    });
    const ctx = root.openExecutionContext();
    expect(setups).toBe(0);
    await expect(ctx.surface.find({ id: "1" })).resolves.toEqual({
      ok: true,
      value: { id: "1", total: 10 },
    });
    expect(setups).toBe(1);
    await expect(ctx.surface.find({ id: "1" })).resolves.toEqual({
      ok: true,
      value: { id: "1", total: 10 },
    });
    expect(setups).toBe(1);

    expect(disposed).toBe(false);
    await ctx.dispose();
    expect(disposed).toBe(false);
    await root.dispose();
    expect(disposed).toBe(true);
  });

  it("types using deps from the Intent Contract without re-declaring them", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const CancelOrder = Orders.intent("cancel").contract<OrderId, void, CancelError>();

    const CancelProvider = CancelOrder.provide
      .using({ find: FindOrder })
      .with(({ deps: { find } }) => {
        expectTypeOf(find).toEqualTypeOf<
          (input: OrderId) => Result<Order, FindError> | Promise<Result<Order, FindError>>
        >();
        return async function (id) {
          const found = await find(id);
          if (!found.ok) {
            return err({ kind: "already_cancelled" });
          }
          return ok(undefined);
        };
      });

    expect(CancelProvider.intent).toBe(CancelOrder);
    expect(CancelProvider.deps).toEqual({ find: FindOrder });
    expect(CancelProvider.lifetimePolicy).toBe("auto");
    expect(CancelProvider.origin).toEqual({ kind: "boundary", id: "orders" });
    expect(Object.isFrozen(CancelProvider.deps)).toBe(true);
  });

  it("rejects cross-boundary Intents in using", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();
    const CancelOrder = Orders.intent("cancel").contract<OrderId, void, CancelError>();

    // @ts-expect-error — using only accepts Intents of the same boundary brand
    CancelOrder.provide.using({ find: SelectOrder });

    void FindOrder;
  });

  it("adapt path allows cross-boundary using and sets adapter origin", () => {
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

    const Billing = boundary("billing");
    const Charge = Billing.intent("charge").contract<OrderId, void, never>();
    // @ts-expect-error — adapt only accepts Intents of the target boundary
    OrdersPostgres.adapt(Charge);
  });

  it("allows perContext in the chain before with and retains the flag", () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    const PingPerContext = Ping.provide.perContext().with(
      (_ctx) =>
        function () {
          return ok("pong");
        }
    );
    expect(PingPerContext.lifetimePolicy).toBe("context");
    expect(PingPerContext.deps).toEqual({});

    const GetPerContext = GetOrder.provide
      .using({ find: FindOrder })
      .perContext()
      .with(
        ({ deps: { find } }) =>
          function (id) {
            return find(id);
          }
      );
    expect(GetPerContext.lifetimePolicy).toBe("context");
    expect(GetPerContext.deps).toEqual({ find: FindOrder });

    const GetPerContextAlt = GetOrder.provide
      .perContext()
      .using({ find: FindOrder })
      .with(
        ({ deps: { find } }) =>
          function (id) {
            return find(id);
          }
      );
    expect(GetPerContextAlt.lifetimePolicy).toBe("context");
    expect(GetPerContextAlt.deps).toEqual({ find: FindOrder });
  });

  it("allows perComposition as an explicit lifetime pin", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    const GetShared = GetOrder.provide
      .using({ find: FindOrder })
      .perComposition()
      .with(
        ({ deps: { find } }) =>
          function (id) {
            return find(id);
          }
      );

    expect(GetShared.lifetimePolicy).toBe("composition");
    expect(GetShared.deps).toEqual({ find: FindOrder });
  });

  it("makes using one-shot: second call is a type error and throws at runtime", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const ListOrders = Orders.intent("list").contract<void, Order[], never>();
    const CancelOrder = Orders.intent("cancel").contract<OrderId, void, CancelError>();

    const afterUsing = CancelOrder.provide.using({ find: FindOrder });
    expectTypeOf(afterUsing).not.toHaveProperty("using");

    expect(() =>
      // @ts-expect-error — using is one-shot; merge deps into a single call
      afterUsing.using({ list: ListOrders })
    ).toThrow(/using\(\) can only be called once/);
  });

  it("type-rejects and runtime-throws symbol keys in using", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const CancelOrder = Orders.intent("cancel").contract<OrderId, void, CancelError>();
    const depKey = Symbol("find");

    expect(() =>
      // @ts-expect-error — using dependency keys must be strings
      CancelOrder.provide.using({ [depKey]: FindOrder })
    ).toThrow(/Provider using\(\) keys must be strings; got symbol/);
  });

  it("runtime-throws __proto__ as a using dependency key", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const CancelOrder = Orders.intent("cancel").contract<OrderId, void, CancelError>();

    const deps = Object.create(null) as Record<string, typeof FindOrder>;
    deps.__proto__ = FindOrder;

    expect(() => CancelOrder.provide.using(deps)).toThrow(/__proto__/);
  });
});
