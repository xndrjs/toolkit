import { adapter, err, ok } from "@xndrjs/forma";
import { FindOrder, Orders } from "../core-orders/index";
import { SelectOrder } from "../infrastructure-postgres/index";

const OrdersAdapter = adapter("orders-postgres", Orders);
/**
 * Adapter peer: realizes Orders `FindOrder` by mapping Postgres `SelectOrder`
 * rows (snake_case) into Orders shapes.
 */
export const FindOrderAdapter = OrdersAdapter.adapt(FindOrder)
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
