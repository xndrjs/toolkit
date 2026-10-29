import { boundary, err } from "@xndrjs/forma";
import type { DemoSeed, FindError, Order, OrderId } from "./types";

export type { DemoSeed, FindError, Order, OrderId } from "./types";

export const Orders = boundary("orders");

/** Open: this boundary does not realize it. An Adapter realizes it at composition. */
export const FindOrder = Orders.intent("find").contract<OrderId, Order, FindError>();

export const GetOrder = Orders.intent("get").contract<OrderId, Order, FindError>();

/**
 * Surface policy: guests are forbidden; admin/viewer may read via FindOrder.
 * Seed comes from open/with (`lifetime.seed`) — not a shallow rename of FindOrder.
 */
export const GetOrderProvider = GetOrder.provide
  .perContext()
  .using({ find: FindOrder })
  .with(({ deps: { find }, lifetime }) => {
    const seed = lifetime.seed as DemoSeed;
    return async function execute(id) {
      if (seed.role === "guest") {
        return err({ kind: "forbidden" as const });
      }
      return find(id);
    };
  });
