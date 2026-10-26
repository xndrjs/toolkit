import { bind, compose } from "@xndrjs/forma";
import { FindOrder, GetOrderProvider } from "./orders/index";
import { ConnectionProvider, SelectOrder, SelectOrderProvider } from "./postgres/index";

/** Composition is the only place that crosses boundary folders. */
export const root = compose({
  surface: { getOrder: GetOrderProvider },
  providers: [SelectOrderProvider, ConnectionProvider],
  bindings: [bind(FindOrder, SelectOrder)],
});
