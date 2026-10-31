import { describe, expect, expectTypeOf, it } from "vitest";
import { aliasIntent, boundary, compose, ok, type IntentAlias, type Provider } from "@xndrjs/forma";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

describe("aliasIntent — contract compatibility", () => {
  it("accepts Intents with structurally equivalent contracts (distinct identities)", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");

    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    type PgOrderId = { readonly id: string };
    type PgOrder = { readonly id: string; readonly total: number };
    type PgFindError = { readonly kind: "not_found" };
    const SelectOrder = Postgres.intent("selectOrder").contract<PgOrderId, PgOrder, PgFindError>();

    const pair = aliasIntent(FindOrder, SelectOrder);

    expect(pair[0]).toBe(FindOrder);
    expect(pair[1]).toBe(SelectOrder);
    expect(Object.isFrozen(pair)).toBe(true);
    const aliasSymbols = Object.getOwnPropertySymbols(pair);
    expect(aliasSymbols).toHaveLength(1);
    expect(Object.getOwnPropertyDescriptor(pair, aliasSymbols[0]!)).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
    expectTypeOf(pair).toExtend<IntentAlias>();
  });

  it("type-rejects Intents whose contracts are not structurally equivalent", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");

    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const CountRows = Postgres.intent("countRows").contract<number, string, { code: 1 }>();

    // @ts-expect-error — Input/Success/Err are not mutually assignable
    aliasIntent(FindOrder, CountRows);
  });

  it("compose accepts aliasIntent() pairs and rejects raw Intent tuples", async () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");

    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
    type PgOrderId = { readonly id: string };
    type PgOrder = { readonly id: string; readonly total: number };
    type PgFindError = { readonly kind: "not_found" };
    const SelectOrder = Postgres.intent("selectOrder").contract<PgOrderId, PgOrder, PgFindError>();

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
      entryBoundaries: [Orders],
      surface: { getOrder: GetOrderProvider },
      wiring: [SelectOrderProvider, aliasIntent(FindOrder, SelectOrder)],
    });

    const ctx = root.openExecutionContext();
    await expect(ctx.surface.getOrder({ id: "1" })).resolves.toEqual({
      ok: true,
      value: { id: "1", total: 1 },
    });

    // Raw tuples are not IntentAlias — must go through aliasIntent().
    expect(() =>
      compose({
        entryBoundaries: [Orders],
        surface: { getOrder: GetOrderProvider },
        // @ts-expect-error — raw [Intent, Intent] is not an IntentAlias / WiringEntry
        wiring: [SelectOrderProvider, [FindOrder, SelectOrder]],
      })
    ).toThrow(/Invalid wiring entry: expected a Provider or Intent alias created by Forma/);

    const spreadPair = [...aliasIntent(FindOrder, SelectOrder)];
    expect(Object.getOwnPropertySymbols(spreadPair)).toEqual([]);
    expect(() =>
      compose({
        entryBoundaries: [Orders],
        surface: { getOrder: GetOrderProvider },
        wiring: [SelectOrderProvider, spreadPair],
      } as never)
    ).toThrow(/Invalid wiring entry: expected a Provider or Intent alias created by Forma/);
  });

  it("rejects spread-cloned Intents", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const SelectOrder = Postgres.intent("selectOrder").contract<OrderId, Order, FindError>();

    const spread = { ...FindOrder };
    expect(Object.getOwnPropertySymbols(spread)).toEqual([]);
    expect(() => aliasIntent(spread, SelectOrder)).toThrow(
      /Intent aliases require Intent values created by boundary\(\)\.intent\/stream/
    );
  });

  it("accepts same-boundary aliasIntent when contracts match", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const LookupOrder = Orders.intent("lookup").contract<OrderId, Order, FindError>();

    const pair = aliasIntent(FindOrder, LookupOrder);
    expect(pair[0]).toBe(FindOrder);
    expect(pair[1]).toBe(LookupOrder);
  });

  it("type-rejects aliasIntent() pairs as surface Providers", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const LookupOrder = Orders.intent("lookup").contract<OrderId, Order, FindError>();

    type SurfaceProvider = Provider<string, string, OrderId, Order, FindError>;

    // Surface is Record<string, Provider…>; IntentAlias is not assignable.
    // @ts-expect-error — IntentAlias is not a Provider
    const entry: SurfaceProvider = aliasIntent(FindOrder, LookupOrder);
    void entry;
  });
});
