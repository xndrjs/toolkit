import { boundary, err } from "@xndrjs/forma";
import type { DemoParams, FindError, Order, OrderEvent, OrderId, WatchError } from "./types";

export type { DemoParams, FindError, Order, OrderEvent, OrderId, WatchError } from "./types";

export const Orders = boundary("orders");

/** Open: this boundary does not realize it. An Adapter realizes it at composition. */
export const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();

export const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

/** Public stream entry owned by Orders. */
export const WatchOrders = Orders.stream("watchOrders").contract<OrderId, OrderEvent, WatchError>();

/** Dynamic seam realized privately by the selected Orders Adapter. */
export const WatchOrderEvents = Orders.stream("watchOrderEvents").contract<
  OrderId,
  OrderEvent,
  WatchError
>();

export const WatchOrdersProvider = WatchOrders.provide
  .using({ events: WatchOrderEvents })
  .with(({ deps: { events } }) => {
    return (id, invocation) => events(id, invocation);
  });

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
