import { describe, expect, expectTypeOf, it } from "vitest";
import {
  adapter,
  aliasIntent,
  boundary,
  compose,
  ok,
  type IntentAlias,
  type Result,
  type StreamInvocation,
  type StreamOperation,
  type StreamSurfaceIterable,
} from "@xndrjs/forma";

type WatchInput = { readonly customerId: string };
type OrderEvent = { readonly orderId: string; readonly status: string };
type WatchError = { readonly kind: "unavailable" };

describe("compose — Adapter / alias / using + describePlan mode", () => {
  it("Adapter.adapt preserves stream modality (StreamOperation factory)", async () => {
    const Orders = boundary("orders");
    const Infra = boundary("infra");
    const WatchOrders = Orders.stream("watchOrders").contract<WatchInput, OrderEvent, WatchError>();
    const SourceEvents = Infra.stream("sourceEvents").contract<
      WatchInput,
      OrderEvent,
      WatchError
    >();

    const SourceProvider = SourceEvents.provide.with(
      () =>
        async function* (input, _invocation) {
          yield ok({ orderId: input.customerId, status: "open" });
        }
    );

    const WatchViaInfra = adapter("orders-infra", Orders)
      .adapt(WatchOrders)
      .using({ source: SourceEvents })
      .with(({ deps: { source } }) => {
        expectTypeOf(source).toEqualTypeOf<StreamOperation<WatchInput, OrderEvent, WatchError>>();
        return source;
      });

    expect(WatchViaInfra.intent).toBe(WatchOrders);
    expect(WatchViaInfra.intent.modality).toBe("stream");
    expect(WatchViaInfra.origin).toEqual({ kind: "adapter", id: "orders-infra" });

    type FactoryReturn = Awaited<ReturnType<typeof WatchViaInfra.factory>>;
    expectTypeOf<FactoryReturn>().toEqualTypeOf<
      StreamOperation<WatchInput, OrderEvent, WatchError>
    >();

    const root = compose({
      surface: { watchOrders: WatchViaInfra },
      wiring: [SourceProvider],
    });
    await using ctx = root.openExecutionContext();

    const stream = ctx.surface.watchOrders({ customerId: "c1" });
    expectTypeOf(stream).toEqualTypeOf<StreamSurfaceIterable<OrderEvent, WatchError>>();

    const events: Result<OrderEvent, WatchError>[] = [];
    for await (const event of stream) {
      events.push(event);
    }
    expect(events).toEqual([{ ok: true, value: { orderId: "c1", status: "open" } }]);
  });

  it("Adapter.adapt of a unary Intent stays unary", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<WatchInput, OrderEvent, WatchError>();

    const FindViaAdapter = adapter("orders-pg", Orders)
      .adapt(FindOrder)
      .with(() => (input) => ok({ orderId: input.customerId, status: "open" }));

    expect(FindViaAdapter.intent.modality).toBe("unary");
    type FactoryReturn = Awaited<ReturnType<typeof FindViaAdapter.factory>>;
    expectTypeOf<FactoryReturn>().toEqualTypeOf<
      (
        input: WatchInput
      ) => Result<OrderEvent, WatchError> | Promise<Result<OrderEvent, WatchError>>
    >();
  });

  it("aliasIntent accepts stream → stream when contracts match", () => {
    const Orders = boundary("orders");
    const Infra = boundary("infra");
    const WatchOrders = Orders.stream("watchOrders").contract<WatchInput, OrderEvent, WatchError>();
    const SourceEvents = Infra.stream("sourceEvents").contract<
      WatchInput,
      OrderEvent,
      WatchError
    >();

    const pair = aliasIntent(WatchOrders, SourceEvents);
    expect(pair[0]).toBe(WatchOrders);
    expect(pair[1]).toBe(SourceEvents);
    expectTypeOf(pair).toExtend<IntentAlias>();
  });

  it("type-rejects unary ↔ stream aliasIntent", () => {
    const Orders = boundary("orders");
    const Infra = boundary("infra");
    const FindOrder = Orders.intent("find").contract<WatchInput, OrderEvent, WatchError>();
    const WatchOrders = Orders.stream("watchOrders").contract<WatchInput, OrderEvent, WatchError>();
    const SourceEvents = Infra.stream("sourceEvents").contract<
      WatchInput,
      OrderEvent,
      WatchError
    >();
    const SelectOrder = Infra.intent("selectOrder").contract<WatchInput, OrderEvent, WatchError>();

    // @ts-expect-error — unary required cannot alias a stream satisfier
    aliasIntent(FindOrder, SourceEvents);
    // @ts-expect-error — stream required cannot alias a unary satisfier
    aliasIntent(WatchOrders, SelectOrder);
  });

  it("using a Stream Intent resolves to StreamOperation (not an open iterator)", async () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<WatchInput, OrderEvent, WatchError>();
    const RelayOrders = Orders.stream("relayOrders").contract<WatchInput, OrderEvent, WatchError>();

    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* (input, invocation: StreamInvocation) {
          expect(invocation.signal).toBeInstanceOf(AbortSignal);
          yield ok({ orderId: input.customerId, status: "open" });
          yield ok({ orderId: input.customerId, status: "paid" });
        }
    );

    const RelayProvider = RelayOrders.provide
      .using({ watch: WatchOrders })
      .with(({ deps: { watch } }) => {
        expectTypeOf(watch).toEqualTypeOf<StreamOperation<WatchInput, OrderEvent, WatchError>>();
        return (input, invocation) => watch(input, invocation);
      });

    type RelayDeps = Parameters<typeof RelayProvider.factory>[0];
    expectTypeOf<RelayDeps["watch"]>().toEqualTypeOf<
      StreamOperation<WatchInput, OrderEvent, WatchError>
    >();

    const root = compose({
      surface: { relayOrders: RelayProvider },
      wiring: [WatchProvider],
    });
    await using ctx = root.openExecutionContext();

    const events: OrderEvent[] = [];
    for await (const event of ctx.surface.relayOrders({ customerId: "c9" })) {
      if (event.ok) {
        events.push(event.value);
      }
    }
    expect(events).toEqual([
      { orderId: "c9", status: "open" },
      { orderId: "c9", status: "paid" },
    ]);
  });

  it("describePlan exposes mode on all registered Intents (surface + wiring)", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<WatchInput, OrderEvent, WatchError>();
    const WatchOrders = Orders.stream("watchOrders").contract<WatchInput, OrderEvent, WatchError>();
    const RelayOrders = Orders.stream("relayOrders").contract<WatchInput, OrderEvent, WatchError>();

    const FindProvider = FindOrder.provide.with(
      () => (input) => ok({ orderId: input.customerId, status: "open" })
    );
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* (input) {
          yield ok({ orderId: input.customerId, status: "open" });
        }
    );
    const RelayProvider = RelayOrders.provide.using({ watch: WatchOrders }).with(
      ({ deps: { watch } }) =>
        (input, invocation) =>
          watch(input, invocation)
    );

    const root = compose({
      surface: { find: FindProvider, relayOrders: RelayProvider },
      wiring: [WatchProvider],
    });

    expect(root.describePlan().providers).toEqual([
      {
        intent: ["orders", "find"],
        mode: "unary",
        declared: "auto",
        effective: "composition",
      },
      {
        intent: ["orders", "relayOrders"],
        mode: "stream",
        declared: "auto",
        effective: "composition",
      },
      {
        intent: ["orders", "watchOrders"],
        mode: "stream",
        declared: "auto",
        effective: "composition",
      },
    ]);
  });
});
