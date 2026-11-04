import { compose } from "@xndrjs/forma";
import {
  FindOrderViaMemoryProvider,
  WatchOrderEventsViaMemoryProvider,
} from "./adapters/orders-memory";
import {
  FindOrderViaSqliteProvider,
  WatchOrderEventsViaSqliteProvider,
} from "./adapters/orders-sqlite";
import { GetOrderProvider, Orders, WatchOrdersProvider } from "./boundaries/orders";
import {
  DatabaseProvider,
  SelectOrderEventsProvider,
  SelectOrderProvider,
} from "./boundaries/sqlite";

export type OrdersStorage = "sqlite" | "memory";

export function composeOrdersWithSqlite() {
  return compose({
    entryBoundaries: [Orders],
    surface: {
      getOrder: GetOrderProvider,
      watchOrders: WatchOrdersProvider,
    },
    wiring: [
      FindOrderViaSqliteProvider,
      WatchOrderEventsViaSqliteProvider,
      SelectOrderProvider,
      SelectOrderEventsProvider,
      DatabaseProvider,
    ],
  });
}

export function composeOrdersWithMemory() {
  return compose({
    entryBoundaries: [Orders],
    surface: {
      getOrder: GetOrderProvider,
      watchOrders: WatchOrdersProvider,
    },
    wiring: [FindOrderViaMemoryProvider, WatchOrderEventsViaMemoryProvider],
  });
}

export function createOrdersRoot(storage: OrdersStorage) {
  return storage === "memory" ? composeOrdersWithMemory() : composeOrdersWithSqlite();
}
