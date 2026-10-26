import { compose } from "@xndrjs/forma";
import { FindOrder, GetOrderProvider } from "./orders/index.js";
import {
  ConnectionProvider,
  ReadyProvider,
  SelectOrder,
  SelectOrderProvider,
} from "./postgres/index.js";

/** Composition is the only place that crosses boundary folders. */
export const root = compose({
  surface: { getOrder: GetOrderProvider },
  providers: [SelectOrderProvider, ConnectionProvider, ReadyProvider],
  bindings: [[FindOrder, SelectOrder]],
});
