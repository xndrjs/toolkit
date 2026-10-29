import { adapter, err, ok } from "@xndrjs/forma";
import { FindOrder, Orders } from "../core-orders/index";
import { SelectOrder } from "../infrastructure-postgres/index";

/** Forma Adapter peer targeting Orders; maps Postgres rows into Orders shapes. */
const OrdersPostgres = adapter("orders-postgres", Orders);

/**
 * Realizes Orders `FindOrder` via Postgres `SelectOrder`
 * (snake_case rows → camelCase Order).
 */
export const FindOrderViaPostgresProvider = OrdersPostgres.adapt(FindOrder)
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
