import { adapter } from "@xndrjs/forma";
import {
  FindOrder,
  Orders,
  WatchOrderEvents,
  type Order,
  type OrderStatus,
} from "../boundaries/orders";

const orders: ReadonlyMap<string, Order> = new Map([["42", { id: "42", total: 100 }]]);
const statuses: readonly OrderStatus[] = ["open", "paid", "shipped"];

const OrdersMemory = adapter("orders-memory", Orders);

export const FindOrderViaMemoryProvider = OrdersMemory.adapt(FindOrder).with(
  ({ out }) =>
    function findOrder(id) {
      const order = orders.get(id.id);
      return order ? out.success(order) : out.expectedError({ code: "not_found" });
    }
);

export const WatchOrderEventsViaMemoryProvider = OrdersMemory.adapt(WatchOrderEvents).with(
  ({ out }) =>
    async function* watchOrderEvents(id, invocation) {
      if (!orders.has(id.id)) {
        yield out.expectedError({ code: "not_found" });
        return;
      }

      try {
        for (const status of statuses) {
          invocation.signal.throwIfAborted();
          yield out.success({ orderId: id.id, status });
        }
      } finally {
        console.log(`watchOrders(${id.id}) closed (memory)`);
      }
    }
);
