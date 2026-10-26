import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { bind, compose, type Binding } from "./compose.js";
import { ok } from "./result.js";

type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

describe("bind — contract compatibility", () => {
  it("accepts Intents with structurally equivalent contracts (distinct identities)", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");

    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    type PgOrderId = { readonly id: string };
    type PgOrder = { readonly id: string; readonly total: number };
    type PgFindError = { readonly kind: "not_found" };
    const SelectOrder = Postgres.intent("selectOrder").contract<PgOrderId, PgOrder, PgFindError>();

    const pair = bind(FindOrder, SelectOrder);

    expect(pair[0]).toBe(FindOrder);
    expect(pair[1]).toBe(SelectOrder);
    expectTypeOf(pair).toExtend<Binding>();
  });

  it("type-rejects Intents whose contracts are not structurally equivalent", () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");

    const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();
    const CountRows = Postgres.intent("countRows").contract<number, string, { code: 1 }>();

    // @ts-expect-error — Input/Success/Err are not mutually assignable
    bind(FindOrder, CountRows);
  });

  it("compose accepts bind() pairs and rejects raw Intent tuples", async () => {
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
      providers: [SelectOrderProvider],
      bindings: [bind(FindOrder, SelectOrder)],
    });

    const ctx = root.createExecutionContext();
    await expect(ctx.getOrder({ id: "1" })).resolves.toEqual({
      ok: true,
      value: { id: "1", total: 1 },
    });

    // Raw tuples are not Binding — must go through bind().
    compose({
      surface: { getOrder: GetOrderProvider },
      providers: [SelectOrderProvider],
      // @ts-expect-error — raw [Intent, Intent] is not a Binding
      bindings: [[FindOrder, SelectOrder]],
    });
  });
});
