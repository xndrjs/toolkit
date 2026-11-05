import { adapter } from "@xndrjs/forma";
import {
  FindOrderById,
  FindOrderEventsByOrderId,
  Orders,
  type Order,
  type OrderStatus,
} from "../boundaries/orders";

const orders: ReadonlyMap<string, Order> = new Map([["42", { id: "42", total: 100 }]]);
const statuses: readonly OrderStatus[] = ["open", "paid", "shipped"];

const OrdersMemory = adapter("orders-memory", Orders);

export const FindOrderByIdViaMemoryProvider = OrdersMemory.adapt(FindOrderById).with(
  ({ out }) =>
    function findOrderById(id) {
      const order = orders.get(id);
      return order ? out.success(order) : out.expectedError({ code: "not_found" });
    }
);

export const FindOrderEventsByOrderIdViaMemoryProvider = OrdersMemory.adapt(
  FindOrderEventsByOrderId
).with(
  ({ out }) =>
    async function* watchOrderEvents(id, invocation) {
      if (!orders.has(id)) {
        yield out.expectedError({ code: "not_found" });
        return;
      }

      try {
        for (const status of statuses) {
          invocation.signal.throwIfAborted();
          yield out.success({ orderId: id, status });
        }
      } finally {
        console.log(`watchOrderEvents(${id}) closed (memory)`);
      }
    }
);
