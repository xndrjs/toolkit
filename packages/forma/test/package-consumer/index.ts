import {
  boundary,
  compose,
  expectedError,
  success,
  type InvocationOutcome,
  type StreamSurfaceIterable,
} from "@xndrjs/forma";

type Order = { readonly id: string; readonly requestId: string };
type OrderEvent = { readonly orderId: string; readonly status: "created" };
type NotFound = { readonly code: "not-found" };
type StorageError = { readonly code: "NO_ROW" };
type WatchError = { readonly code: "unavailable" };

const Orders = boundary("orders");
const FindOrder = Orders.intent("findOrder").contract<{ readonly id: string }, Order, NotFound>();
const WatchOrders = Orders.stream("watchOrders").contract<
  { readonly id: string },
  OrderEvent,
  WatchError
>();

let contextProviderDisposed = false;

const FindOrderProvider = FindOrder.provide
  .perContext<{ readonly requestId: string }>()
  .with(({ lifetime, params, out }) => {
    lifetime.onDispose(() => {
      contextProviderDisposed = true;
    });

    return async (input) => {
      const stored: InvocationOutcome<{ readonly id: string }, StorageError> =
        input.id === "missing" ? expectedError({ code: "NO_ROW" }) : success({ id: input.id });

      return out.match(stored, {
        success: (order) => out.success({ id: order.id, requestId: params.requestId }),
        expectedError: {
          NO_ROW: () => out.expectedError({ code: "not-found" }),
        },
      });
    };
  });

const WatchOrdersProvider = WatchOrders.provide.with(
  ({ out }) =>
    async function* (input, invocation) {
      invocation.signal.throwIfAborted();
      yield out.success({ orderId: input.id, status: "created" as const });
    }
);

await using root = compose({
  entryBoundaries: [Orders],
  surface: {
    findOrder: FindOrderProvider,
    watchOrders: WatchOrdersProvider,
  },
});

const plan = root.describePlan();
if (plan.surface.length !== 2) {
  throw new Error("the packed runtime returned an unexpected composition plan");
}

await root.withExecutionContext(
  async (surface) => {
    const found: InvocationOutcome<Order, NotFound> = await surface.findOrder({ id: "42" });
    if (
      found.kind !== "success" ||
      found.value.id !== "42" ||
      found.value.requestId !== "package-smoke"
    ) {
      throw new Error("the packed unary operation returned an unexpected result");
    }

    const stream: StreamSurfaceIterable<OrderEvent, WatchError> = surface.watchOrders({ id: "42" });
    const events: OrderEvent[] = [];
    for await (const event of stream) {
      if (event.kind !== "success") {
        throw new Error("the packed stream returned an unexpected domain error");
      }
      events.push(event.value);
    }

    if (events.length !== 1 || events[0]?.orderId !== "42") {
      throw new Error("the packed stream returned unexpected items");
    }
  },
  { params: { requestId: "package-smoke" } }
);

if (!contextProviderDisposed) {
  throw new Error("the packed runtime did not dispose its context-owned Provider");
}
