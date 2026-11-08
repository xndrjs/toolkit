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
        return out.match(outcome, {
          success: (order) =>
            out.success({
              id: order.order_id,
              total: order.amount_cents / 100,
            }),
          expectedError: {
            NO_ROW: () => out.expectedError({ code: "not_found" }),
          },
        });
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
            yield out.match(outcome, {
              success: (event) => {
                if (!isOrderStatus(event.status)) return out.unexpectedFailure();
                return out.success({
                  orderId: event.order_id,
                  status: event.status,
                });
              },
              expectedError: {
                NO_ROW: () => out.expectedError({ code: "not_found" }),
              },
            });
          }
        } finally {
          console.log(`watchOrderEvents(${id}) closed (sqlite)`);
        }
      }
  );
