import { describe, expect, it } from "vitest";
import { adapter } from "./adapter.js";
import { boundary } from "./boundary.js";
import { compose } from "./compose.js";
import { ok } from "./result.js";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

/**
 * F1 — structured Intent identity `(boundaryId, intentName)`.
 * Runtime resolver and type-level graph keys share this key (no fresh Symbol).
 */
describe("compose — structured Intent identity (F1)", () => {
  it("F1.1: resolves across two boundary('orders') instances with the same Intent name", async () => {
    const OrdersA = boundary("orders");
    const OrdersB = boundary("orders");
    const FindA = OrdersA.intent("find").contract<OrderId, Order, FindError>();
    const FindB = OrdersB.intent("find").contract<OrderId, Order, FindError>();
    const GetB = OrdersB.intent("get").contract<OrderId, Order, FindError>();

    const FindProvider = FindA.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 7 });
        }
    );
    const GetProvider = GetB.provide.using({ find: FindB }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      surface: { getOrder: GetProvider },
      wiring: [FindProvider],
    });
    const ctx = root.createExecutionContext();
    await expect(ctx.getOrder({ id: "1" })).resolves.toEqual({
      ok: true,
      value: { id: "1", total: 7 },
    });
  });

  it("F1.2: resolves across two intent('find') declarations on the same Boundary", async () => {
    const Orders = boundary("orders");
    const FindDecl1 = Orders.intent("find").contract<OrderId, Order, FindError>();
    const FindDecl2 = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

    const FindProvider = FindDecl1.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 3 });
        }
    );
    const GetProvider = GetOrder.provide.using({ find: FindDecl2 }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      surface: { getOrder: GetProvider },
      wiring: [FindProvider],
    });
    const ctx = root.createExecutionContext();
    await expect(ctx.getOrder({ id: "x" })).resolves.toEqual({
      ok: true,
      value: { id: "x", total: 3 },
    });
  });

  it("F1.2: throws when two providers compete for the same structured key", () => {
    const Orders = boundary("orders");
    const FindA = Orders.intent("find").contract<OrderId, Order, FindError>();
    const FindB = Orders.intent("find").contract<OrderId, Order, FindError>();

    const ProviderA = FindA.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 1 });
        }
    );
    const ProviderB = FindB.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 2 });
        }
    );

    expect(() =>
      compose({
        surface: { a: ProviderA, b: ProviderB },
      })
    ).toThrow(/is registered more than once in surface/);
  });

  it("F1.3: keeps boundary('a.b').intent('c') distinct from boundary('a').intent('b.c')", async () => {
    const Dot = boundary("a.b");
    const Plain = boundary("a");
    const IntentDot = Dot.intent("c").contract<void, "dot", never>();
    const IntentPlain = Plain.intent("b.c").contract<void, "plain", never>();

    const DotProvider = IntentDot.provide.with(
      (_ctx) =>
        function () {
          return ok("dot" as const);
        }
    );
    const PlainProvider = IntentPlain.provide.with(
      (_ctx) =>
        function () {
          return ok("plain" as const);
        }
    );

    const root = compose({
      surface: { fromDot: DotProvider, fromPlain: PlainProvider },
    });
    const ctx = root.createExecutionContext();
    await expect(ctx.fromDot()).resolves.toEqual({ ok: true, value: "dot" });
    await expect(ctx.fromPlain()).resolves.toEqual({ ok: true, value: "plain" });
  });

  it("F1.3: type-rejects a missing provider that would alias under dotted concat", () => {
    const Dot = boundary("a.b");
    const Plain = boundary("a");
    const IntentDot = Dot.intent("c").contract<void, true, never>();
    const IntentPlain = Plain.intent("b.c").contract<void, true, never>();

    const NeedsDot = Dot.intent("needs").contract<void, true, never>();
    const NeedsProvider = NeedsDot.provide.using({ dep: IntentDot }).with(
      ({ deps: { dep } }) =>
        function () {
          return dep();
        }
    );
    const PlainProvider = IntentPlain.provide.with(
      (_ctx) =>
        function () {
          return ok(true as const);
        }
    );

    // Registering ("a","b.c") must not satisfy ("a.b","c").
    expect(() =>
      // @ts-expect-error — Missing provider for Intent(s): a.b.c
      compose({
        surface: { needs: NeedsProvider },
        wiring: [PlainProvider],
      })
    ).toThrow(/No provider registered for Intent a\.b\.c/);
  });

  it("F1.4: widened string Intent names weaken type-level completeness (prefer literals)", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const wideName = "other" as string;
    const Other = Orders.intent(wideName).contract<void, true, never>();

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

    // Footgun: Other's type-level key is ["orders", string], which can erase the
    // missing `orders.find` check at the type level. Runtime closed-graph check
    // at compose still fails — keep Intent names literal.
    expect(() =>
      compose({
        surface: { getOrder: GetOrderProvider },
        wiring: [OtherProvider],
      })
    ).toThrow(/No provider registered for Intent orders\.find/);
  });

  it("same-boundary using accepts Intent from a homonymous Boundary instance", async () => {
    const OrdersA = boundary("orders");
    const OrdersB = boundary("orders");
    const FindB = OrdersB.intent("find").contract<OrderId, Order, FindError>();
    const GetA = OrdersA.intent("get").contract<OrderId, Order, FindError>();

    const FindProvider = FindB.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 9 });
        }
    );
    // using FindB (OrdersB) from GetA (OrdersA) — same BoundaryId string.
    const GetProvider = GetA.provide.using({ find: FindB }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      surface: { getOrder: GetProvider },
      wiring: [FindProvider],
    });
    const ctx = root.createExecutionContext();
    await expect(ctx.getOrder({ id: "2" })).resolves.toEqual({
      ok: true,
      value: { id: "2", total: 9 },
    });
  });

  it("adapt accepts an Intent from a homonymous target Boundary instance", async () => {
    const OrdersA = boundary("orders");
    const OrdersB = boundary("orders");
    const Postgres = boundary("postgres");
    const FindB = OrdersB.intent("find").contract<OrderId, Order, FindError>();
    const Select = Postgres.intent("select").contract<OrderId, Order, FindError>();

    const SelectProvider = Select.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 11 });
        }
    );
    const FindViaPg = adapter("orders-pg", OrdersA)
      .adapt(FindB)
      .using({ select: Select })
      .with(
        ({ deps: { select } }) =>
          function (id) {
            return select(id);
          }
      );

    const root = compose({
      surface: { find: FindViaPg },
      wiring: [SelectProvider],
    });
    const ctx = root.createExecutionContext();
    await expect(ctx.find({ id: "3" })).resolves.toEqual({
      ok: true,
      value: { id: "3", total: 11 },
    });
  });
});
