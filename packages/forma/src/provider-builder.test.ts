import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { err, ok, type Result } from "./result.js";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };
type CancelError = { readonly kind: "already_cancelled" };

describe("provider builder", () => {
  it("builds a provider for a no-deps Intent via provide.with", () => {
    const Health = boundary("health");
    const Ping = Health.intent<void, "pong", never>("ping");

    const PingProvider = Ping.provide.with(() => () => ok("pong"));

    expect(PingProvider.intent).toBe(Ping);
    expect(PingProvider.deps).toEqual({});
    expect(PingProvider.perContext).toBe(false);

    const op = PingProvider.factory({});
    expect(op()).toEqual({ ok: true, value: "pong" });
  });

  it("types using deps from the Intent Contract without re-declaring them", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent<OrderId, Order, FindError>("find");
    const CancelOrder = Orders.intent<OrderId, void, CancelError>("cancel");

    const CancelProvider = CancelOrder.provide
      .using({ find: FindOrder })
      .with(({ find }) => async (id) => {
        const found = await find(id);
        if (!found.ok) {
          return err({ kind: "already_cancelled" });
        }
        return ok(undefined);
      });

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
    const FindOrder = Orders.intent<OrderId, Order, FindError>("find");
    const SelectOrder = Postgres.intent<OrderId, Order, FindError>("selectOrder");
    const CancelOrder = Orders.intent<OrderId, void, CancelError>("cancel");

    // @ts-expect-error — using only accepts Intents of the same boundary brand
    CancelOrder.provide.using({ find: SelectOrder });

    void FindOrder;
  });

  it("allows perContext in the chain before with and retains the flag", () => {
    const Health = boundary("health");
    const Ping = Health.intent<void, "pong", never>("ping");
    const Orders = boundary("orders");
    const FindOrder = Orders.intent<OrderId, Order, FindError>("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>("get");

    const PingPerContext = Ping.provide.perContext().with(() => () => ok("pong"));
    expect(PingPerContext.perContext).toBe(true);
    expect(PingPerContext.deps).toEqual({});

    const GetPerContext = GetOrder.provide
      .using({ find: FindOrder })
      .perContext()
      .with(
        ({ find }) =>
          (id) =>
            find(id)
      );
    expect(GetPerContext.perContext).toBe(true);
    expect(GetPerContext.deps).toEqual({ find: FindOrder });

    const GetPerContextAlt = GetOrder.provide
      .perContext()
      .using({ find: FindOrder })
      .with(
        ({ find }) =>
          (id) =>
            find(id)
      );
    expect(GetPerContextAlt.perContext).toBe(true);
    expect(GetPerContextAlt.deps).toEqual({ find: FindOrder });
  });
});
