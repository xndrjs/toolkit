import { describe, expect, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose } from "./compose.js";
import { ok } from "./result.js";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

/**
 * Composition type-safety keys Intents by `boundaryId.name`. The curried
 * `intent<In, Success, Err>()("name")` form keeps `name` as a string literal so
 * same-contract Intents stay distinct at the type level (see boundary.ts).
 */
describe("compose — composition safety", () => {
  it("type-rejects surface needing an Intent with no provider after bindings", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent<OrderId, Order, FindError>()("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>()("get");

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ find }) =>
        (id) =>
          find(id)
    );

    // Missing FindOrder provider (and no binding rewrite) — PoC compile bar.
    // @ts-expect-error — Missing provider for Intent(s): orders.find
    compose({
      surface: { getOrder: GetOrderProvider },
    });
  });

  it("type-accepts the graph when the required Intent is registered privately", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent<OrderId, Order, FindError>()("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>()("get");

    const FindOrderProvider = FindOrder.provide.with((id) => ok({ id: id.id, total: 1 }));
    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ find }) =>
        (id) =>
          find(id)
    );

    const root = compose({
      surface: { getOrder: GetOrderProvider },
      providers: [FindOrderProvider],
    });
    expect(typeof root.createExecutionContext).toBe("function");
  });

  it("type-accepts a binding rewrite when the satisfier provider is registered", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent<OrderId, Order, FindError>()("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>()("get");
    const SelectOrder = Postgres.intent<OrderId, Order, FindError>()("selectOrder");

    const SelectOrderProvider = SelectOrder.provide.with((id) => ok({ id: id.id, total: 1 }));
    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ find }) =>
        (id) =>
          find(id)
    );

    const root = compose({
      surface: { getOrder: GetOrderProvider },
      providers: [SelectOrderProvider],
      bindings: [[FindOrder, SelectOrder]],
    });
    expect(typeof root.createExecutionContext).toBe("function");
  });

  it("type-rejects a binding whose satisfier has no registered provider", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent<OrderId, Order, FindError>()("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>()("get");
    const SelectOrder = Postgres.intent<OrderId, Order, FindError>()("selectOrder");

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ find }) =>
        (id) =>
          find(id)
    );

    // @ts-expect-error — Missing provider for Intent(s): postgres.selectOrder
    compose({
      surface: { getOrder: GetOrderProvider },
      bindings: [[FindOrder, SelectOrder]],
    });
  });

  it("throws when the same Intent is in both surface and providers", () => {
    const Health = boundary("health");
    const Ping = Health.intent<void, "pong", never>("ping");
    const PingProvider = Ping.provide.with(() => ok("pong" as const));

    expect(() =>
      compose({
        surface: { ping: PingProvider },
        providers: [PingProvider],
      })
    ).toThrow(/appears in both surface and providers/);
  });

  it("throws when a Required Intent has both a provider and a binding", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent<OrderId, Order, FindError>("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>("get");
    const SelectOrder = Postgres.intent<OrderId, Order, FindError>("selectOrder");

    const FindOrderProvider = FindOrder.provide.with((id) => ok({ id: id.id, total: 1 }));
    const SelectOrderProvider = SelectOrder.provide.with((id) => ok({ id: id.id, total: 2 }));
    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ find }) =>
        (id) =>
          find(id)
    );

    expect(() =>
      compose({
        surface: { getOrder: GetOrderProvider },
        providers: [FindOrderProvider, SelectOrderProvider],
        bindings: [[FindOrder, SelectOrder]],
      })
    ).toThrow(/Ambiguous satisfaction for Intent orders\.find/);
  });
});
