import { adapter, expectedError, success } from "@xndrjs/forma";
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
        switch (row.kind) {
          case "success":
            return success({
              id: row.value.order_id,
              total: row.value.amount_cents / 100,
            });
          case "error":
            return expectedError({ kind: "not_found" as const });
          case "unexpected":
          case "cancelled":
            return row;
        }
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
        switch (row.kind) {
          case "success":
            break;
          case "error":
            yield expectedError({ kind: "not_found" as const });
            return;
          case "unexpected":
          case "cancelled":
            yield row;
            return;
        }

        try {
          for (const status of STATUSES) {
            invocation.signal.throwIfAborted();
            yield success({ orderId: row.value.order_id, status });
          }
        } finally {
          console.log(`watchOrders(${id.id}) closed (postgres)`);
        }
      }
  );
