import { describe, expect, it } from "vitest";
import { boundary } from "./boundary.js";
import { aliasIntent, compose } from "./compose.js";
import { ok } from "./result.js";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

/**
 * Composition type-safety keys Intents by structured `(boundaryId, intentName)`.
 * `intent("name").contract<In, Success, Err>()` keeps `name` as a string literal so
 * same-contract Intents stay distinct at the type level (see boundary.ts).
 */
describe("compose — composition safety", () => {
  it("type-rejects surface needing an Intent with no provider after aliases", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    // Missing FindOrder provider (and no intent-alias rewrite) — compile bar + compose throw.
    expect(() =>
      // @ts-expect-error — Missing provider for Intent(s): orders.find
      compose({
        surface: { getOrder: GetOrderProvider },
      })
    ).toThrow(/No provider registered for Intent orders\.find/);
  });

  it("type-rejects missing provider despite another same-boundary provider", () => {
    // Literal names must stay distinct: registering Other must not satisfy FindOrder
    // via a widened `orders.${string}` key (regression for the old intent<…>(name) form).
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const Other = Orders.intent("other").contract<void, true, never>();

    const OtherProvider = Other.provide.with(
      (_ctx) =>
        function () {
          return ok(true as const);
        }
    );
    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    // Missing FindOrder provider — must still be a compile error despite OtherProvider.
    expect(() =>
      // @ts-expect-error — Missing provider for Intent(s): orders.find
      compose({
        surface: { getOrder: GetOrderProvider },
        wiring: [OtherProvider],
      })
    ).toThrow(/No provider registered for Intent orders\.find/);
  });

  it("type-accepts the graph when the required Intent is registered privately", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    const FindOrderProvider = FindOrder.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 1 });
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
    expect(typeof root.openExecutionContext).toBe("function");
    expect(typeof root.withExecutionContext).toBe("function");
    expect(typeof root.createExecutionContext).toBe("function");
  });

  it("type-accepts an intent-alias rewrite when the satisfier provider is registered", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();

    const SelectOrderProvider = SelectOrder.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 1 });
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
      wiring: [SelectOrderProvider, aliasIntent(FindOrder, SelectOrder)],
    });
    expect(typeof root.openExecutionContext).toBe("function");
  });

  it("type-rejects an intent alias whose satisfier has no registered provider", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    expect(() =>
      // @ts-expect-error — Missing provider for Intent(s): postgres.selectOrder
      compose({
        surface: { getOrder: GetOrderProvider },
        wiring: [aliasIntent(FindOrder, SelectOrder)],
      })
    ).toThrow(/No provider registered for Intent postgres\.selectOrder/);
  });

  it("type-rejects a .perComposition() provider that depends directly on .perContext()", () => {
    const Db = boundary("db");
    const Query = Db.intent("query").contract<void, { readonly conn: number }, never>();
    const Conn = Db.intent("conn").contract<void, { readonly id: number }, never>();

    const ConnProvider = Conn.provide.perContext().with(
      (_ctx) =>
        function () {
          return ok({ id: 1 });
        }
    );
    const QueryProvider = Query.provide
      .perComposition()
      .using({ conn: Conn })
      .with(
        ({ deps: { conn } }) =>
          async function () {
            const result = await conn();
            if (!result.ok) {
              throw new Error("expected ok conn");
            }
            return ok({ conn: result.value.id });
          }
      );

    expect(() =>
      // @ts-expect-error — .perComposition() cannot depend directly on .perContext()
      compose({
        surface: { query: QueryProvider },
        wiring: [ConnProvider],
      })
    ).toThrow(/Lifetime conflict.*db\.query.*db\.conn/);
  });

  it("throws when the same Intent is registered twice in surface", () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProviderA = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );
    const PingProviderB = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );

    expect(() =>
      compose({
        surface: { pingA: PingProviderA, pingB: PingProviderB },
      })
    ).toThrow(/is registered more than once in surface/);
  });

  it("throws when the same Intent is registered twice in wiring", () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const Ready = Health.intent("ready").contract<void, true, never>();
    const PingProviderA = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );
    const PingProviderB = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );
    const ReadyProvider = Ready.provide.with(
      (_ctx) =>
        function () {
          return ok(true as const);
        }
    );

    expect(() =>
      compose({
        surface: { ready: ReadyProvider },
        wiring: [PingProviderA, PingProviderB],
      })
    ).toThrow(/is registered more than once in wiring/);
  });

  it("throws when the same Intent is in both surface and wiring", () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const PingProvider = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );

    expect(() =>
      compose({
        surface: { ping: PingProvider },
        wiring: [PingProvider],
      })
    ).toThrow(/appears in both surface and wiring/);
  });

  it("throws when a Required Intent has both a provider and an intent alias", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();

    const FindOrderProvider = FindOrder.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 1 });
        }
    );
    const SelectOrderProvider = SelectOrder.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 2 });
        }
    );
    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    expect(() =>
      compose({
        surface: { getOrder: GetOrderProvider },
        wiring: [FindOrderProvider, SelectOrderProvider, aliasIntent(FindOrder, SelectOrder)],
      })
    ).toThrow(/Ambiguous satisfaction for Intent orders\.find/);
  });

  it("throws when the same Required Intent is bound twice", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();
    const SelectOrderAlt = Postgres.intent("selectOrderAlt").contract<OrderId, Order, FindError>();

    const SelectOrderProvider = SelectOrder.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 1 });
        }
    );
    const SelectOrderAltProvider = SelectOrderAlt.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 2 });
        }
    );
    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    expect(() =>
      compose({
        surface: { getOrder: GetOrderProvider },
        wiring: [
          SelectOrderProvider,
          SelectOrderAltProvider,
          aliasIntent(FindOrder, SelectOrder),
          aliasIntent(FindOrder, SelectOrderAlt),
        ],
      })
    ).toThrow(/Duplicate intent alias for Intent orders\.find/);
  });
});
