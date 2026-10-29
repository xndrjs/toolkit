import { compose } from "@xndrjs/forma";
import { FindOrderAdapter } from "./adapter-orders-postgres/index";
import { GetOrderProvider } from "./core-orders/index";
import { ConnectionProvider, SelectOrderProvider } from "./infrastructure-postgres/index";

/** Composition is the only place that crosses boundary folders. */
export const root = compose({
  surface: { getOrder: GetOrderProvider },
  providers: [SelectOrderProvider, ConnectionProvider, FindOrderAdapter],
});
