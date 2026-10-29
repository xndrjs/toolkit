import { adapter, err, ok } from "@xndrjs/forma";
import type { Order } from "../core-orders/index";
import { FindOrder, Orders } from "../core-orders/index";

const orders: ReadonlyMap<string, Order> = new Map([["42", { id: "42", total: 100 }]]);

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
