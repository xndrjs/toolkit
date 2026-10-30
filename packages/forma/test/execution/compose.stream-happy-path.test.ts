import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { boundary, compose, ok, type Result, type StreamSurfaceIterable } from "@xndrjs/forma";

type WatchInput = { readonly customerId: string };
type OrderEvent = { readonly orderId: string; readonly status: string };
type WatchError = { readonly kind: "unavailable" };

describe("compose — Stream Intent happy path", () => {
  it("exposes boundary.stream().contract with modality stream", () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<WatchInput, OrderEvent, WatchError>();

    expect(WatchOrders.boundaryId).toBe("orders");
    expect(WatchOrders.name).toBe("watchOrders");
    expect(WatchOrders.modality).toBe("stream");
    expectTypeOf(WatchOrders.modality).toEqualTypeOf<"stream">();
  });

  it("keeps unary intent modality unary", () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<WatchInput, OrderEvent, WatchError>();
    expect(FindOrder.modality).toBe("unary");
    expectTypeOf(FindOrder.modality).toEqualTypeOf<"unary">();
  });

  it("surface returns a sync AsyncIterable (not a Promise)", async () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<WatchInput, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* (input, _invocation) {
          yield ok({ orderId: input.customerId, status: "open" });
        }
    );

    const root = compose({ surface: { watchOrders: WatchProvider } });
    await using ctx = root.openExecutionContext();

    const stream = ctx.surface.watchOrders({ customerId: "c1" });
    expect(stream).not.toBeInstanceOf(Promise);
    expectTypeOf(stream).toEqualTypeOf<StreamSurfaceIterable<OrderEvent, WatchError>>();
    expectTypeOf(ctx.surface.watchOrders).toEqualTypeOf<
      (input: WatchInput) => StreamSurfaceIterable<OrderEvent, WatchError>
    >();

    const events: Result<OrderEvent, WatchError>[] = [];
    for await (const event of stream) {
      events.push(event);
    }
    expect(events).toEqual([{ ok: true, value: { orderId: "c1", status: "open" } }]);
  });

  it("does not materialize the Provider until the first next()", async () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const factory = vi.fn(
      () =>
        async function* (_input: void, _invocation: { readonly signal: AbortSignal }) {
          yield ok({ orderId: "1", status: "open" });
        }
    );
    const WatchProvider = WatchOrders.provide.with(factory);

    const root = compose({ surface: { watchOrders: WatchProvider } });
    await using ctx = root.openExecutionContext();

    const stream = ctx.surface.watchOrders();
    expect(factory).not.toHaveBeenCalled();

    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { ok: true, value: { orderId: "1", status: "open" } },
    });
    expect(factory).toHaveBeenCalledTimes(1);

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it("yields multiple ok items then completes and releases the lease", async () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    let disposed = false;
    const WatchProvider = WatchOrders.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(() => {
        disposed = true;
      });
      return async function* (_input, invocation) {
        expect(invocation.signal).toBeInstanceOf(AbortSignal);
        expect(invocation.signal.aborted).toBe(false);
        yield ok({ orderId: "1", status: "open" });
        yield ok({ orderId: "2", status: "paid" });
      };
    });

    const root = compose({ surface: { watchOrders: WatchProvider } });
    const ctx = root.openExecutionContext();

    const events: OrderEvent[] = [];
    for await (const event of ctx.surface.watchOrders()) {
      if (event.ok) {
        events.push(event.value);
      }
    }
    expect(events).toEqual([
      { orderId: "1", status: "open" },
      { orderId: "2", status: "paid" },
    ]);

    // Natural completion released the stream lease; dispose should settle without hang.
    await expect(ctx.dispose()).resolves.toBeUndefined();
    expect(disposed).toBe(true);
  });

  it("two surface calls produce independent streams", async () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<
      { readonly tag: string },
      OrderEvent,
      WatchError
    >();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* (input) {
          yield ok({ orderId: input.tag, status: "open" });
        }
    );

    const root = compose({ surface: { watchOrders: WatchProvider } });
    await using ctx = root.openExecutionContext();

    const a = ctx.surface.watchOrders({ tag: "a" });
    const b = ctx.surface.watchOrders({ tag: "b" });

    const firstA = await a[Symbol.asyncIterator]().next();
    const firstB = await b[Symbol.asyncIterator]().next();
    expect(firstA.value).toEqual({ ok: true, value: { orderId: "a", status: "open" } });
    expect(firstB.value).toEqual({ ok: true, value: { orderId: "b", status: "open" } });
  });

  it("rejects a second iteration of the same stream value", async () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          yield ok({ orderId: "1", status: "open" });
        }
    );

    const root = compose({ surface: { watchOrders: WatchProvider } });
    await using ctx = root.openExecutionContext();

    const stream = ctx.surface.watchOrders();
    stream[Symbol.asyncIterator]();
    expect(() => stream[Symbol.asyncIterator]()).toThrow(/single-consumer/);
  });

  it("passes StreamInvocation.signal subordinate to the execution context signal", async () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    let seenSignal: AbortSignal | undefined;
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* (_input, invocation) {
          seenSignal = invocation.signal;
          yield ok({ orderId: "1", status: "open" });
        }
    );

    const root = compose({ surface: { watchOrders: WatchProvider } });
    await using ctx = root.openExecutionContext();

    for await (const _ of ctx.surface.watchOrders()) {
      // consume
    }

    expect(seenSignal).toBeDefined();
    expect(seenSignal).not.toBe(ctx.signal);
    // Aborting the context should abort the (already completed) invocation signal lineage;
    // for a live stream this is covered in cancellation tests — here we only assert distinctness.
  });

  it("leaves unary surface behavior unchanged alongside a stream surface", async () => {
    const Orders = boundary("orders");
    const FindOrder = Orders.intent("find").contract<
      { readonly id: string },
      OrderEvent,
      WatchError
    >();
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();

    const FindProvider = FindOrder.provide.with(
      () =>
        function (input) {
          return ok({ orderId: input.id, status: "found" });
        }
    );
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          yield ok({ orderId: "w", status: "open" });
        }
    );

    const root = compose({
      surface: { findOrder: FindProvider, watchOrders: WatchProvider },
    });
    await using ctx = root.openExecutionContext();

    expectTypeOf(ctx.surface.findOrder).toEqualTypeOf<
      (input: { readonly id: string }) => Promise<Result<OrderEvent, WatchError>>
    >();
    await expect(ctx.surface.findOrder({ id: "x" })).resolves.toEqual({
      ok: true,
      value: { orderId: "x", status: "found" },
    });

    const events: Result<OrderEvent, WatchError>[] = [];
    for await (const event of ctx.surface.watchOrders()) {
      events.push(event);
    }
    expect(events).toEqual([{ ok: true, value: { orderId: "w", status: "open" } }]);
  });

  it("materializes a stream Provider only once across multiple next() calls", async () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const factory = vi.fn(
      () =>
        async function* () {
          yield ok({ orderId: "1", status: "open" });
          yield ok({ orderId: "2", status: "paid" });
        }
    );
    const WatchProvider = WatchOrders.provide.with(factory);

    const root = compose({ surface: { watchOrders: WatchProvider } });
    await using ctx = root.openExecutionContext();

    const events: OrderEvent[] = [];
    for await (const event of ctx.surface.watchOrders()) {
      if (event.ok) {
        events.push(event.value);
      }
    }
    expect(factory).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(2);
  });
});
