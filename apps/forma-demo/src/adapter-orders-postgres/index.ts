import { adapter, createUnexpectedFailure } from "@xndrjs/forma";
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
    ({ deps: { select }, out }) =>
      async function (id) {
        const outcome = await select({ order_id: id.id });
        switch (outcome.kind) {
          case "success":
            return out.success({
              id: outcome.value.order_id,
              total: outcome.value.amount_cents / 100,
            });
          case "error":
            switch (outcome.error.code) {
              case "NO_ROW":
                return out.expectedError({ code: "not_found" });
              default:
                const failure = createUnexpectedFailure();
                console.error(`Unknown ${outcome.error.code} ${failure.id}`);
                return out.unexpectedFailure(failure);
            }
          default:
            return outcome;
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
    ({ deps: { select }, out }) =>
      async function* (id, invocation) {
        const outcome = await select({ order_id: id.id });
        switch (outcome.kind) {
          case "success":
            break;
          case "error":
            yield out.expectedError({ code: "not_found" as const });
            return;
          default:
            yield outcome;
            return;
        }

        try {
          for (const status of STATUSES) {
            invocation.signal.throwIfAborted();
            yield out.success({ orderId: outcome.value.order_id, status });
          }
        } finally {
          console.log(`watchOrders(${id.id}) closed (postgres)`);
        }
      }
  );
