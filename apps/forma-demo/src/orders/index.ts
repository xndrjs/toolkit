import { boundary } from "@xndrjs/forma";
import type { FindError, Order, OrderId } from "./types";

export type { FindError, Order, OrderId } from "./types";

export const Orders = boundary("orders");

/** Open: this boundary does not realize it. Composition binds it. */
export const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();

export const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();
export const GetOrderProvider = GetOrder.provide
  .perContext()
  .using({ find: FindOrder })
  .with(
    ({ deps: { find } }) =>
      function execute(id) {
        return find(id);
      }
  );
