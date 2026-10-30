import { adapter, err, ok } from "@xndrjs/forma";
import { FindOrder, Orders, WatchOrderEvents } from "../core-orders/index";
import { SelectOrder } from "../infrastructure-postgres/index";

/** Forma Adapter peer targeting Orders; maps Postgres rows into Orders shapes. */
const OrdersPostgres = adapter("orders-postgres", Orders);

const STATUSES = ["open", "paid", "shipped"] as const;

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

/**
 * Realizes Orders `WatchOrders` via Postgres `SelectOrder`, then yields a fake
 * status progression. Per-stream cleanup runs on natural end, `break`, or dispose.
 */
export const WatchOrderEventsViaPostgresProvider = OrdersPostgres.adapt(WatchOrderEvents)
  .using({ select: SelectOrder })
  .with(
    ({ deps: { select } }) =>
      async function* (id, invocation) {
        const row = await select({ order_id: id.id });
        if (!row.ok) {
          yield err({ kind: "not_found" as const });
          return;
        }

        try {
          for (const status of STATUSES) {
            invocation.signal.throwIfAborted();
            yield ok({ orderId: row.value.order_id, status });
          }
        } finally {
          console.log(`watchOrders(${id.id}) closed (postgres)`);
        }
      }
  );
