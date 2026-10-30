import { compose } from "@xndrjs/forma";
import {
  FindOrderViaMemoryProvider,
  WatchOrderEventsViaMemoryProvider,
} from "./adapter-orders-memory/index";
import {
  FindOrderViaPostgresProvider,
  WatchOrderEventsViaPostgresProvider,
} from "./adapter-orders-postgres/index";
import { GetOrderProvider, Orders, WatchOrdersProvider } from "./core-orders/index";
import { ConnectionProvider, SelectOrderProvider } from "./infrastructure-postgres/index";

export type AdapterKind = "postgres" | "memory";

/** Postgres Adapter + async connection wiring. Params inferred from GetOrderProvider. */
export function composePostgres() {
  return compose({
    entryBoundaries: [Orders],
    surface: {
      getOrder: GetOrderProvider,
      watchOrders: WatchOrdersProvider,
    },
    wiring: [
      FindOrderViaPostgresProvider,
      WatchOrderEventsViaPostgresProvider,
      SelectOrderProvider,
      ConnectionProvider,
    ],
  });
}

/** In-memory Adapter — same Surface, different realization of FindOrder / WatchOrders. */
export function composeMemory() {
  return compose({
    entryBoundaries: [Orders],
    surface: {
      getOrder: GetOrderProvider,
      watchOrders: WatchOrdersProvider,
    },
    wiring: [FindOrderViaMemoryProvider, WatchOrderEventsViaMemoryProvider],
  });
}

export function createRoot(kind: AdapterKind) {
  return kind === "memory" ? composeMemory() : composePostgres();
}
