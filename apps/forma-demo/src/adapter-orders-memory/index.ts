import { adapter, err, ok } from "@xndrjs/forma";
import type { Order } from "../core-orders/index";
import { FindOrder, Orders, WatchOrders } from "../core-orders/index";

const orders: ReadonlyMap<string, Order> = new Map([["42", { id: "42", total: 100 }]]);

const STATUSES = ["open", "paid", "shipped"] as const;

/** Second Adapter: same Orders Intents, in-memory store (no infra Boundary). */
const OrdersMemory = adapter("orders-memory", Orders);

/**
 * Realizes Orders `FindOrder` from an in-memory map — shapes already match Orders,
 * so the factory forwards without field mapping (Adapter passthrough style).
 */
export const FindOrderViaMemoryProvider = OrdersMemory.adapt(FindOrder).with(
  () =>
    function (id) {
      const order = orders.get(id.id);
      return order ? ok(order) : err({ kind: "not_found" as const });
    }
);

/**
 * Realizes Orders `WatchOrders`: yields a short status progression for a known order.
 * Honors `invocation.signal` so break / context dispose / host abort unblock promptly.
 */
export const WatchOrdersViaMemoryProvider = OrdersMemory.adapt(WatchOrders).with(
  () =>
    async function* (id, invocation) {
      const order = orders.get(id.id);
      if (!order) {
        yield err({ kind: "not_found" as const });
        return;
      }

      try {
        for (const status of STATUSES) {
          invocation.signal.throwIfAborted();
          yield ok({ orderId: order.id, status });
        }
      } finally {
        console.log(`watchOrders(${id.id}) closed (memory)`);
      }
    }
);
