import { FindOrder, GetOrder } from "./intents.js";

export const GetOrderProvider = GetOrder.provide
  .perContext()
  .using({ find: FindOrder })
  .with(
    ({ find }) =>
      function execute(id) {
        return find(id);
      }
  );
