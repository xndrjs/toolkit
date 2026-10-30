import { describe, expect, it } from "vitest";
import { boundary } from "@xndrjs/forma";
import { aliasIntent, compose, defineComposition, defineWiring } from "@xndrjs/forma";
import type { ComposeOptions } from "@xndrjs/forma";
import { ok } from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

describe("compose — defineWiring / defineComposition (F6; extraction only)", () => {
  it("type-accepts a complete graph when wiring is extracted via defineWiring", () => {
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

    const wiring = defineWiring(FindOrderProvider);
    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring,
    });
    expect(typeof root.withExecutionContext).toBe("function");
  });

  it("type-rejects a plain extracted array as if private providers were missing", () => {
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

    const wiringLoose = [FindOrderProvider];
    // @ts-expect-error — Missing provider for Intent(s): orders.find (widened array)
    compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: wiringLoose,
    });
  });

  it("type-accepts defineComposition then compose with the same precise bag", () => {
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

    const definition = defineComposition({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: defineWiring(FindOrderProvider),
    });
    const root = compose(definition);
    expect(typeof root.openExecutionContext).toBe("function");
  });

  it("type-accepts defineWiring with aliasIntent aliases", () => {
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

    const wiring = defineWiring(SelectOrderProvider, aliasIntent(FindOrder, SelectOrder));
    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring,
    });
    expect(typeof root.withExecutionContext).toBe("function");
  });

  it("type-rejects a Provider union in a wiring slot", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const Other = Orders.intent("other").contract<void, true, never>();

    const FindOrderProvider = FindOrder.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 1 });
        }
    );
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

    // Cast keeps the union; a `const x: A | B = A` is CFA-narrowed to A.
    const either = FindOrderProvider as typeof FindOrderProvider | typeof OtherProvider;
    void OtherProvider;
    // @ts-expect-error — Provider unions are not allowed in wiring
    compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: [either],
    });
  });

  it("type-rejects a Provider union on a surface alias", () => {
    const Health = boundary("health");
    const Ping = Health.intent("ping").contract<void, "pong", never>();
    const Pong = Health.intent("pong").contract<void, "ping", never>();

    const PingProvider = Ping.provide.with(
      (_ctx) =>
        function () {
          return ok("pong" as const);
        }
    );
    const PongProvider = Pong.provide.with(
      (_ctx) =>
        function () {
          return ok("ping" as const);
        }
    );

    // Cast keeps the union; a `const x: A | B = A` is CFA-narrowed to A.
    const either = PingProvider as typeof PingProvider | typeof PongProvider;
    void PongProvider;
    // @ts-expect-error — Provider unions are not allowed on surface alias(es): ping
    compose({
      entryBoundaries: [Health],
      surface: { ping: either },
    });
  });

  it("documents that annotating as ComposeOptions widens and weakens checks", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    // A bare annotation erases provider provenance and graph precision.
    const widened: ComposeOptions = {
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
    };
    // @ts-expect-error — erased provenance cannot prove the exact Entry Boundary set
    expect(() => compose(widened)).toThrow(/No provider registered for Intent orders\.find/);
  });
});
