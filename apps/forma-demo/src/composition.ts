import { compose } from "@xndrjs/forma";
import { FindOrderAdapter } from "./adapter-orders-postgres/index";
import { GetOrderProvider } from "./core-orders/index";
import { ConnectionProvider, SelectOrderProvider } from "./infrastructure-postgres/index";

export const root = compose({
  surface: { getOrder: GetOrderProvider },
  wiring: [FindOrderAdapter, SelectOrderProvider, ConnectionProvider],
});
