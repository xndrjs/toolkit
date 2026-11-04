import { boundary } from "@xndrjs/forma";

export type OrderId = { readonly id: string };
export type Order = { readonly id: string; readonly total: number };
export type OrderStatus = "open" | "paid" | "shipped";
export type OrderEvent = { readonly orderId: string; readonly status: OrderStatus };

export type LookupError = { readonly code: "not_found" };
export type GetOrderError = LookupError | { readonly code: "forbidden" };
export type WatchError = LookupError;

export type OrdersParams = {
  readonly role: "admin" | "viewer" | "guest";
};

export const Orders = boundary("orders");

/** Local seam realized by the selected Orders Adapter. */
export const FindOrder = Orders.intent("find").contract<OrderId, Order, LookupError>();

/** Public unary use case owned by Orders. */
export const GetOrder = Orders.intent("get").contract<OrderId, Order, GetOrderError>();

/** Public stream use case owned by Orders. */
export const WatchOrders = Orders.stream("watchOrders").contract<OrderId, OrderEvent, WatchError>();

/** Local stream seam realized by the selected Orders Adapter. */
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

/** Guests are rejected before the selected storage Adapter is invoked. */
export const GetOrderProvider = GetOrder.provide
  .perContext<OrdersParams>()
  .using({ find: FindOrder })
  .with(({ deps: { find }, params, out }) => {
    return async function execute(id) {
      if (params.role === "guest") {
        return out.expectedError({ code: "forbidden" });
      }
      return find(id);
    };
  });
