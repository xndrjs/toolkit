import { compose } from "@xndrjs/forma";
import {
  FindOrderByIdViaMemoryProvider,
  FindOrderEventsByOrderIdViaMemoryProvider,
} from "./adapters/orders-memory";
import {
  FindOrderByIdViaSqliteProvider,
  FindOrderEventsByOrderIdViaSqliteProvider,
} from "./adapters/orders-sqlite";
import { GetOrderDetailsProvider, Orders, WatchOrderEventsProvider } from "./boundaries/orders";
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
      getOrderDetails: GetOrderDetailsProvider,
      watchOrderEvents: WatchOrderEventsProvider,
    },
    wiring: [
      FindOrderByIdViaSqliteProvider,
      FindOrderEventsByOrderIdViaSqliteProvider,
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
      getOrderDetails: GetOrderDetailsProvider,
      watchOrderEvents: WatchOrderEventsProvider,
    },
    wiring: [FindOrderByIdViaMemoryProvider, FindOrderEventsByOrderIdViaMemoryProvider],
  });
}

export function createOrdersRoot(storage: OrdersStorage) {
  return storage === "memory" ? composeOrdersWithMemory() : composeOrdersWithSqlite();
}
