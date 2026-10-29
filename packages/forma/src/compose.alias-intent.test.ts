import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { aliasIntent, compose, type IntentAlias } from "./compose.js";
import { ok } from "./result.js";

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
      surface: { getOrder: GetOrderProvider },
      wiring: [SelectOrderProvider, aliasIntent(FindOrder, SelectOrder)],
    });

    const ctx = root.openExecutionContext();
    await expect(ctx.surface.getOrder({ id: "1" })).resolves.toEqual({
      ok: true,
      value: { id: "1", total: 1 },
    });

    // Raw tuples are not IntentAlias — must go through aliasIntent().
    compose({
      surface: { getOrder: GetOrderProvider },
      // @ts-expect-error — raw [Intent, Intent] is not an IntentAlias / WiringEntry
      wiring: [SelectOrderProvider, [FindOrder, SelectOrder]],
    });
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

    type SurfaceProvider = import("./provider.js").Provider<
      string,
      string,
      OrderId,
      Order,
      FindError
    >;

    // Surface is Record<string, Provider…>; IntentAlias is not assignable.
    // @ts-expect-error — IntentAlias is not a Provider
    const entry: SurfaceProvider = aliasIntent(FindOrder, LookupOrder);
    void entry;
  });
});
