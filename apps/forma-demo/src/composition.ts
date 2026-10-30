import { compose } from "@xndrjs/forma";
import {
  FindOrderViaMemoryProvider,
  WatchOrdersViaMemoryProvider,
} from "./adapter-orders-memory/index";
import {
  FindOrderViaPostgresProvider,
  WatchOrdersViaPostgresProvider,
} from "./adapter-orders-postgres/index";
import { GetOrderProvider } from "./core-orders/index";
import { ConnectionProvider, SelectOrderProvider } from "./infrastructure-postgres/index";

export type AdapterKind = "postgres" | "memory";

/** Postgres Adapter + async connection wiring. Params inferred from GetOrderProvider. */
export function composePostgres() {
  return compose({
    surface: {
      getOrder: GetOrderProvider,
      watchOrders: WatchOrdersViaPostgresProvider,
    },
    wiring: [FindOrderViaPostgresProvider, SelectOrderProvider, ConnectionProvider],
  });
}

/** In-memory Adapter — same Surface, different realization of FindOrder / WatchOrders. */
export function composeMemory() {
  return compose({
    surface: {
      getOrder: GetOrderProvider,
      watchOrders: WatchOrdersViaMemoryProvider,
    },
    wiring: [FindOrderViaMemoryProvider],
  });
}

export function createRoot(kind: AdapterKind) {
  return kind === "memory" ? composeMemory() : composePostgres();
}
