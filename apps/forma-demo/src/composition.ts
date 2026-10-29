import { compose } from "@xndrjs/forma";
import { FindOrderViaMemoryProvider } from "./adapter-orders-memory/index";
import { FindOrderViaPostgresProvider } from "./adapter-orders-postgres/index";
import { GetOrderProvider, type DemoSeed } from "./core-orders/index";
import { ConnectionProvider, SelectOrderProvider } from "./infrastructure-postgres/index";

export type AdapterKind = "postgres" | "memory";

/** Postgres Adapter + async connection wiring. */
export function composePostgres() {
  return compose<DemoSeed>()({
    surface: { getOrder: GetOrderProvider },
    wiring: [FindOrderViaPostgresProvider, SelectOrderProvider, ConnectionProvider],
  });
}

/** In-memory Adapter — same Surface, different realization of FindOrder. */
export function composeMemory() {
  return compose<DemoSeed>()({
    surface: { getOrder: GetOrderProvider },
    wiring: [FindOrderViaMemoryProvider],
  });
}

export function createRoot(kind: AdapterKind) {
  return kind === "memory" ? composeMemory() : composePostgres();
}
