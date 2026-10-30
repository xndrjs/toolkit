import { boundary, err } from "@xndrjs/forma";
import type { DemoParams, FindError, Order, OrderEvent, OrderId, WatchError } from "./types";

export type { DemoParams, FindError, Order, OrderEvent, OrderId, WatchError } from "./types";

export const Orders = boundary("orders");

/** Open: this boundary does not realize it. An Adapter realizes it at composition. */
export const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();

export const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

/**
 * Stream Intent: pull-based status events for one order.
 * Realized by Adapters; each surface call opens a context-owned stream invocation.
 */
export const WatchOrders = Orders.stream("watchOrders").contract<OrderId, OrderEvent, WatchError>();

/**
 * Surface policy: guests are forbidden; admin/viewer may read via FindOrder.
 * Params come from open/with (`ctx.params`) via `.perContext<DemoParams>()`.
 */
export const GetOrderProvider = GetOrder.provide
  .perContext<DemoParams>()
  .using({ find: FindOrder })
  .with(({ deps: { find }, params }) => {
    return async function execute(id) {
      if (params.role === "guest") {
        return err({ kind: "forbidden" as const });
      }
      return find(id);
    };
  });
