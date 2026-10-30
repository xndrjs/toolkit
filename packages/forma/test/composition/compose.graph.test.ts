import { describe, expect, it } from "vitest";
import { boundary } from "@xndrjs/forma";
import { aliasIntent, compose } from "@xndrjs/forma";
import { ok } from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

/**
 * F2 — graph plan at compose: cycles and closed graph before the root is exposed.
 * Runtime `seeing` remains defense-in-depth only.
 */
describe("compose — graph plan and cycle detection (F2)", () => {
  it("rejects a single-chain cycle at compose with the full path", () => {
    const Orders = boundary("orders");
    const A = Orders.intent("a").contract<OrderId, Order, FindError>();
    const B = Orders.intent("b").contract<OrderId, Order, FindError>();

    const ProviderA = A.provide.using({ b: B }).with(
      ({ deps: { b } }) =>
        function (id) {
          return b(id);
        }
    );
    const ProviderB = B.provide.using({ a: A }).with(
      ({ deps: { a } }) =>
        function (id) {
          return a(id);
        }
    );

    expect(() =>
      compose({
        entryBoundaries: [Orders],
        surface: { a: ProviderA },
        wiring: [ProviderB],
      })
    ).toThrow(/Circular dependency: orders\.a -> orders\.b -> orders\.a/);
  });

  it("rejects a concurrent surface A/B cycle at compose (would deadlock under seeing-only)", () => {
    const Orders = boundary("orders");
    const A = Orders.intent("a").contract<OrderId, Order, FindError>();
    const B = Orders.intent("b").contract<OrderId, Order, FindError>();

    const ProviderA = A.provide.using({ b: B }).with(
      ({ deps: { b } }) =>
        function (id) {
          return b(id);
        }
    );
    const ProviderB = B.provide.using({ a: A }).with(
      ({ deps: { a } }) =>
        function (id) {
          return a(id);
        }
    );

    // Both aliases on the surface: historically Promise.all([ctx.surface.a(), ctx.surface.b()])
    // deadlocked because each resolution had its own `seeing` set.
    expect(() =>
      compose({
        entryBoundaries: [Orders],
        surface: { a: ProviderA, b: ProviderB },
      })
    ).toThrow(/^Circular dependency: orders\.(a|b) -> orders\.(a|b) -> orders\.(a|b)$/);
  });

  it("rejects a alias-mediated cycle at compose", () => {
    const Orders = boundary("orders");
    const A = Orders.intent("a").contract<OrderId, Order, FindError>();
    const B = Orders.intent("b").contract<OrderId, Order, FindError>();

    const ProviderA = A.provide.using({ b: B }).with(
      ({ deps: { b } }) =>
        function (id) {
          return b(id);
        }
    );

    // A uses B; aliasIntent(B, A) → A → B → A
    expect(() =>
      compose({
        entryBoundaries: [Orders],
        surface: { a: ProviderA },
        wiring: [aliasIntent(B, A)],
      })
    ).toThrow(/Circular dependency: orders\.a -> orders\.b -> orders\.a/);
  });

  it("rejects a alias-only cycle (mutual aliases) at compose", () => {
    const Orders = boundary("orders");
    const A = Orders.intent("a").contract<OrderId, Order, FindError>();
    const B = Orders.intent("b").contract<OrderId, Order, FindError>();
    const Leaf = Orders.intent("leaf").contract<OrderId, Order, FindError>();

    const LeafProvider = Leaf.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 1 });
        }
    );

    // Mutual aliasIntent(A, B) + aliasIntent(B, A): cycle in the plan (also an open graph).
    // Type-level completeness only walks provider `using` deps (Leaf has none),
    // so this is caught at compose by the execution plan, not by AssertProvidersComplete.
    expect(() =>
      compose({
        entryBoundaries: [Orders],
        surface: { leaf: LeafProvider },
        wiring: [aliasIntent(A, B), aliasIntent(B, A)],
      })
    ).toThrow(/Circular dependency: orders\.(a|b) -> orders\.(a|b) -> orders\.(a|b)/);
  });

  it("allows an alias chain (A uses X aliased to B; B is acyclic)", async () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    const SelectOrder = Orders.intent("select").contract<OrderId, Order, FindError>();

    const SelectProvider = SelectOrder.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 9 });
        }
    );
    const GetProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetProvider },
      wiring: [SelectProvider, aliasIntent(FindOrder, SelectOrder)],
    });
    const ctx = root.openExecutionContext();
    await expect(ctx.surface.getOrder({ id: "1" })).resolves.toEqual({
      ok: true,
      value: { id: "1", total: 9 },
    });
  });

  it("happy-path materialize is unchanged for an acyclic graph", async () => {
    const Orders = boundary("orders");
    const Find = Orders.intent("find").contract<OrderId, Order, FindError>();
    const Get = Orders.intent("get").contract<OrderId, Order, FindError>();

    const FindProvider = Find.provide.with(
      (_ctx) =>
        function (id) {
          return ok({ id: id.id, total: 4 });
        }
    );
    const GetProvider = Get.provide.using({ find: Find }).with(
      ({ deps: { find } }) =>
        function (id) {
          return find(id);
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { getOrder: GetProvider },
      wiring: [FindProvider],
    });
    const ctx = root.openExecutionContext();
    await expect(ctx.surface.getOrder({ id: "x" })).resolves.toEqual({
      ok: true,
      value: { id: "x", total: 4 },
    });
  });

  it("rejects a self-cycle (provider uses its own Intent) at compose", () => {
    const Orders = boundary("orders");
    const A = Orders.intent("a").contract<OrderId, Order, FindError>();

    const ProviderA = A.provide.using({ self: A }).with(
      ({ deps: { self } }) =>
        function (id) {
          return self(id);
        }
    );

    expect(() =>
      compose({
        entryBoundaries: [Orders],
        surface: { a: ProviderA },
      })
    ).toThrow(/Circular dependency: orders\.a -> orders\.a/);
  });
});
