import { adapter } from "@xndrjs/forma";
import {
  FindOrderById,
  FindOrderEventsByOrderId,
  Orders,
  type OrderStatus,
} from "../boundaries/orders";
import { SelectOrder, SelectOrderEvents } from "../boundaries/sqlite";

const OrdersSqlite = adapter("orders-sqlite", Orders);
const validStatuses: readonly OrderStatus[] = ["open", "paid", "shipped"];

function isOrderStatus(value: string): value is OrderStatus {
  return validStatuses.some((status) => status === value);
}

export const FindOrderByIdViaSqliteProvider = OrdersSqlite.adapt(FindOrderById)
  .using({ select: SelectOrder })
  .with(
    ({ deps: { select }, out }) =>
      async function findOrderById(id) {
        const outcome = await select({ order_id: id });
        switch (outcome.kind) {
          case "success":
            return out.success({
              id: outcome.value.order_id,
              total: outcome.value.amount_cents / 100,
            });
          case "expectedError":
            return out.expectedError({ code: "not_found" });
          default:
            return outcome;
        }
      }
  );

export const FindOrderEventsByOrderIdViaSqliteProvider = OrdersSqlite.adapt(
  FindOrderEventsByOrderId
)
  .using({ select: SelectOrderEvents })
  .with(
    ({ deps: { select }, out }) =>
      async function* watchOrderEvents(id, invocation) {
        try {
          for await (const outcome of select({ order_id: id }, invocation)) {
            switch (outcome.kind) {
              case "success":
                if (!isOrderStatus(outcome.value.status)) {
                  yield out.unexpectedFailure();
                  return;
                }
                yield out.success({
                  orderId: outcome.value.order_id,
                  status: outcome.value.status,
                });
                break;
              case "expectedError":
                yield out.expectedError({ code: "not_found" });
                return;
              default:
                yield outcome;
                return;
            }
          }
        } finally {
          console.log(`watchOrderEvents(${id}) closed (sqlite)`);
        }
      }
  );
