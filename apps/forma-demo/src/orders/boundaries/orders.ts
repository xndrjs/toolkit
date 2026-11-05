import { boundary } from "@xndrjs/forma";

export type OrderId = string;
export type Order = { readonly id: string; readonly total: number };
export type OrderStatus = "open" | "paid" | "shipped";
export type OrderEvent = { readonly orderId: string; readonly status: OrderStatus };

export type FindOrderByIdError = { readonly code: "not_found" };
export type GetOrderDetailsError = FindOrderByIdError | { readonly code: "forbidden" };
export type WatchOrderEventsError = FindOrderByIdError;

export type OrdersParams = {
  readonly role: "admin" | "viewer" | "guest";
};

export const Orders = boundary("orders");

/** Local seam realized by the selected Orders Adapter. */
export const FindOrderById = Orders.intent("findOrderById").contract<
  OrderId,
  Order,
  FindOrderByIdError
>();

/** Public unary use case owned by Orders. */
export const GetOrderDetailsUseCase = Orders.intent("getOrderDetailsUseCase").contract<
  OrderId,
  Order,
  GetOrderDetailsError
>();

/** Public stream use case owned by Orders. */
export const WatchOrderEventsUseCase = Orders.stream("watchOrderEventsUseCase").contract<
  OrderId,
  OrderEvent,
  WatchOrderEventsError
>();

/** Local stream seam realized by the selected Orders Adapter. */
export const FindOrderEventsByOrderId = Orders.stream("findOrderEventsByOrderId").contract<
  OrderId,
  OrderEvent,
  WatchOrderEventsError
>();

export const WatchOrderEventsProvider = WatchOrderEventsUseCase.provide
  .using({ events: FindOrderEventsByOrderId })
  .with(({ deps: { events } }) => {
    return (id, invocation) => events(id, invocation);
  });

/** Guests are rejected before the selected storage Adapter is invoked. */
export const GetOrderDetailsProvider = GetOrderDetailsUseCase.provide
  .perContext<OrdersParams>()
  .using({ find: FindOrderById })
  .with(({ deps: { find }, params, out }) => {
    return async function execute(id) {
      if (params.role === "guest") {
        return out.expectedError({ code: "forbidden" });
      }
      return find(id);
    };
  });
