import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { err, ok, type Result } from "./result.js";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };
type CancelError = { readonly kind: "already_cancelled" };

describe("provider builder", () => {
  it("builds a no-deps provider with lifetime in with", () => {
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
    expect(PingProvider.perContext).toBe(false);

    const op = PingProvider.factory(
      {},
      {
        onDispose() {
          /* noop for inspect */
        },
      }
    );
    expect(op(undefined)).toEqual({ ok: true, value: "pong" });
  });

  it("runs no-deps with at materialization and exposes Lifetime", () => {
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

    const disposers: (() => void)[] = [];
    const op = FindProvider.factory(
      {},
      {
        onDispose(cleanup) {
          disposers.push(cleanup);
        },
      }
    );
    // Factory runs when the provider materializes, not on first op call.
    expect(setups).toBe(1);
    expect(op({ id: "1" })).toEqual({ ok: true, value: { id: "1", total: 10 } });
    expect(setups).toBe(1);
    expect(op({ id: "1" })).toEqual({ ok: true, value: { id: "1", total: 10 } });
    expect(setups).toBe(1);

    expect(disposed).toBe(false);
    for (const cleanup of disposers) {
      cleanup();
    }
    expect(disposed).toBe(true);
  });

  it("types using deps from the Intent Contract without re-declaring them", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const CancelOrder = Orders.intent("cancel").contract<OrderId, void, CancelError>();

    const CancelProvider = CancelOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        async function (id) {
          const found = await find(id);
          if (!found.ok) {
            return err({ kind: "already_cancelled" });
          }
          return ok(undefined);
        }
    );

    expect(CancelProvider.intent).toBe(CancelOrder);
    expect(CancelProvider.deps).toEqual({ find: FindOrder });
    expect(CancelProvider.perContext).toBe(false);

    type FactoryDeps = Parameters<typeof CancelProvider.factory>[0];
    expectTypeOf<FactoryDeps["find"]>().toEqualTypeOf<
      (input: OrderId) => Result<Order, FindError> | Promise<Result<Order, FindError>>
    >();
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
    expect(PingPerContext.perContext).toBe(true);
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
    expect(GetPerContext.perContext).toBe(true);
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
    expect(GetPerContextAlt.perContext).toBe(true);
    expect(GetPerContextAlt.deps).toEqual({ find: FindOrder });
  });
});
