import { compose } from "@xndrjs/forma";
import { FindOrderViaMemoryProvider } from "./adapter-orders-memory/index";
import { FindOrderViaPostgresProvider } from "./adapter-orders-postgres/index";
import { GetOrderProvider } from "./core-orders/index";
import { ConnectionProvider, SelectOrderProvider } from "./infrastructure-postgres/index";

export type AdapterKind = "postgres" | "memory";

/** Postgres Adapter + async connection wiring. Params inferred from GetOrderProvider. */
export function composePostgres() {
  return compose({
    surface: { getOrder: GetOrderProvider },
    wiring: [FindOrderViaPostgresProvider, SelectOrderProvider, ConnectionProvider],
  });
}

/** In-memory Adapter — same Surface, different realization of FindOrder. */
export function composeMemory() {
  return compose({
    surface: { getOrder: GetOrderProvider },
    wiring: [FindOrderViaMemoryProvider],
  });
}

export function createRoot(kind: AdapterKind) {
  return kind === "memory" ? composeMemory() : composePostgres();
}
