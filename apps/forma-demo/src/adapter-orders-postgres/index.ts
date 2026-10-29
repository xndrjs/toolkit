import { err, ok } from "@xndrjs/forma";
import type { FindError, Order, OrderId } from "../core-orders/index";
import { Postgres, SelectOrder } from "../infrastructure-postgres/index";

/**
 * Adapter Intent: same structural contract as Orders `FindOrder`, realized by
 * mapping the Postgres `SelectOrder` row (snake_case) into Orders shapes.
 */
export const FindOrderViaSelect = Postgres.intent("findOrderViaSelect").contract<
  OrderId,
  Order,
  FindError
>();

export const FindOrderViaSelectProvider = FindOrderViaSelect.provide
  .perContext()
  .using({ select: SelectOrder })
  .with(
    ({ deps: { select } }) =>
      async function (id) {
        const row = await select({ order_id: id.id });
        if (!row.ok) {
          return err({ kind: "not_found" as const });
        }
        return ok({
          id: row.value.order_id,
          total: row.value.amount_cents / 100,
        });
      }
  );
