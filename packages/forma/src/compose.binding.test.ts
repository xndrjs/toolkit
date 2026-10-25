import { describe, expect, expectTypeOf, it } from "vitest";
import { boundary } from "./boundary.js";
import { compose } from "./compose.js";
import { err, ok, type Result } from "./result.js";

/** Orders-owned contract types (duplicated per boundary — not shared with Postgres). */
type OrderId = { readonly id: string };
type Order = { readonly id: string; readonly total: number };
type FindError = { readonly kind: "not_found" };

describe("compose — explicit cross-boundary binding", () => {
  it("rewrites FindOrder through a structurally matching SelectOrder provider", async () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");

    // Business Intents — GetOrder only `using`s the local FindOrder (no Postgres import in using).
    const FindOrder = Orders.intent<OrderId, Order, FindError>("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>("get");

    // Infra Intent: same structural Contract, different identity + boundary.
    type PgOrderId = { readonly id: string };
    type PgOrder = { readonly id: string; readonly total: number };
    type PgFindError = { readonly kind: "not_found" };
    const SelectOrder = Postgres.intent<PgOrderId, PgOrder, PgFindError>("selectOrder");

    const SelectOrderProvider = SelectOrder.provide.with((id) =>
      id.id === "42" ? ok({ id: "42", total: 100 }) : err({ kind: "not_found" as const })
    );

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

    const ctx = root.createExecutionContext();
    expect(ctx).not.toHaveProperty("findOrder");
    expect(ctx).not.toHaveProperty("selectOrder");
    expectTypeOf(ctx).not.toHaveProperty("findOrder");
    expectTypeOf(ctx).not.toHaveProperty("selectOrder");

    const hit = await ctx.getOrder({ id: "42" });
    expect(hit).toEqual({ ok: true, value: { id: "42", total: 100 } });

    const miss = await ctx.getOrder({ id: "missing" });
    expect(miss).toEqual({ ok: false, error: { kind: "not_found" } });

    await expect(ctx.dispose()).resolves.toBeUndefined();
  });

  it("uses an adapter provider when shapes differ (bound satisfier, not a compose keyword)", async () => {
    const Orders = boundary("orders");
    const Postgres = boundary("postgres");

    const FindOrder = Orders.intent<OrderId, Order, FindError>("find");
    const GetOrder = Orders.intent<OrderId, Order, FindError>("get");

    // Mismatch: Postgres row shape ≠ Orders Order contract.
    type PgRowId = { readonly orderId: string };
    type PgRow = { readonly order_id: string; readonly amount_cents: number };
    type PgSelectError = { readonly code: "NO_ROW" };
    const SelectOrder = Postgres.intent<PgRowId, PgRow, PgSelectError>("selectOrder");

    // Adapter Intent: same structural Contract as FindOrder; realization maps SelectOrder.
    const FindOrderViaSelect = Postgres.intent<OrderId, Order, FindError>("findOrderViaSelect");

    const SelectOrderProvider = SelectOrder.provide.with((input) =>
      input.orderId === "7"
        ? ok({ order_id: "7", amount_cents: 2500 })
        : err({ code: "NO_ROW" as const })
    );

    /** Ordinary provider (could be returned by a helper) — not a `compose` adapt keyword. */
    const FindOrderViaSelectProvider = FindOrderViaSelect.provide
      .using({ select: SelectOrder })
      .with(({ select }) => async (id) => {
        const row = await select({ orderId: id.id });
        if (!row.ok) {
          return err({ kind: "not_found" as const });
        }
        return ok({ id: row.value.order_id, total: row.value.amount_cents / 100 });
      });

    // Business provider: only local Intent in `using` — no infra Intent type.
    const GetOrderProvider = GetOrder.provide.using({ find: FindOrder }).with(
      ({ find }) =>
        (id) =>
          find(id)
    );

    const root = compose({
      surface: { getOrder: GetOrderProvider },
      providers: [SelectOrderProvider, FindOrderViaSelectProvider],
      bindings: [[FindOrder, FindOrderViaSelect]],
    });

    const ctx = root.createExecutionContext();
    const result = await ctx.getOrder({ id: "7" });
    expect(result).toEqual({ ok: true, value: { id: "7", total: 25 } });

    const miss: Result<Order, FindError> = await ctx.getOrder({ id: "none" });
    expect(miss).toEqual({ ok: false, error: { kind: "not_found" } });
  });
});
