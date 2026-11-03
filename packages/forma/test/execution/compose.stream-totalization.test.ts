import { describe, expect, it, vi } from "vitest";
import {
  boundary,
  compose,
  createUnexpectedFailure,
  expectedError,
  isUnexpectedFailure,
  success,
  unexpectedFailure,
  type OnUnexpectedFailure,
  type UnexpectedFailureEvent,
} from "@xndrjs/forma";

type OrderEvent = { readonly orderId: string; readonly status: string };
type WatchError = { readonly code: "unavailable" };

describe("compose — stream totalization", () => {
  it("source throw before the first item yields a terminal unexpected (next does not reject)", async () => {
    const boom = new Error("before item");
    const events: UnexpectedFailureEvent[] = [];
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          throw boom;
          yield success({ orderId: "1", status: "open" });
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { watchOrders: WatchProvider },
      onUnexpectedFailure(event) {
        events.push(event);
      },
    });
    await using ctx = root.openExecutionContext();

    const values = [];
    for await (const value of ctx.surface.watchOrders()) {
      values.push(value);
    }

    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ kind: "unexpectedFailure" });
    if (values[0]?.kind === "unexpectedFailure") {
      expect(isUnexpectedFailure(values[0].failure)).toBe(true);
    }
    expect(events).toHaveLength(1);
    expect(events[0]!.cause).toBe(boom);
    expect(events[0]!.phase).toBe("stream-next");
    expect(events[0]!.failure).toBe(
      values[0]?.kind === "unexpectedFailure" ? values[0].failure : undefined
    );
    expect(events[0]!).not.toHaveProperty("input");
    expect(events[0]!).not.toHaveProperty("params");

    await root.dispose();
  });

  it("source throw after several items yields a single terminal unexpected", async () => {
    const boom = new Error("after items");
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          yield success({ orderId: "1", status: "open" });
          yield success({ orderId: "2", status: "paid" });
          throw boom;
          yield success({ orderId: "3", status: "ghost" });
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { watchOrders: WatchProvider },
      onUnexpectedFailure,
    });
    await using ctx = root.openExecutionContext();

    const values = [];
    for await (const value of ctx.surface.watchOrders()) {
      values.push(value);
    }

    expect(values).toEqual([
      { kind: "success", value: { orderId: "1", status: "open" } },
      { kind: "success", value: { orderId: "2", status: "paid" } },
      expect.objectContaining({ kind: "unexpectedFailure" }),
    ]);
    expect(onUnexpectedFailure).toHaveBeenCalledOnce();
    expect(onUnexpectedFailure.mock.calls[0]![0]!.cause).toBe(boom);
    expect(onUnexpectedFailure.mock.calls[0]![0]!.phase).toBe("stream-next");

    await root.dispose();
  });

  it("expected error and unexpected are both terminal", async () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();

    const ExpectedProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          yield expectedError({ code: "unavailable" });
          yield success({ orderId: "ghost", status: "should-not-appear" });
        }
    );
    const ExplicitProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          yield unexpectedFailure(createUnexpectedFailure());
          yield success({ orderId: "ghost", status: "should-not-appear" });
        }
    );

    const expectedRoot = compose({
      entryBoundaries: [Orders],
      surface: { watchOrders: ExpectedProvider },
    });
    await using expectedCtx = expectedRoot.openExecutionContext();
    const expectedValues = [];
    for await (const value of expectedCtx.surface.watchOrders()) {
      expectedValues.push(value);
    }
    expect(expectedValues).toEqual([{ kind: "expectedError", error: { code: "unavailable" } }]);
    await expectedRoot.dispose();

    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();
    const unexpectedRoot = compose({
      entryBoundaries: [Orders],
      surface: { watchOrders: ExplicitProvider },
      onUnexpectedFailure,
    });
    await using unexpectedCtx = unexpectedRoot.openExecutionContext();
    const unexpectedValues = [];
    for await (const value of unexpectedCtx.surface.watchOrders()) {
      unexpectedValues.push(value);
    }
    expect(unexpectedValues).toHaveLength(1);
    expect(unexpectedValues[0]?.kind).toBe("unexpectedFailure");
    // Explicit Boundary failure must not notify the Composition hook.
    expect(onUnexpectedFailure).not.toHaveBeenCalled();
    await unexpectedRoot.dispose();
  });

  it("Composition hook is notified once at the origin for a core-generated stream failure", async () => {
    const boom = new Error("origin");
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          yield success({ orderId: "1", status: "open" });
          throw boom;
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { watchOrders: WatchProvider },
      onUnexpectedFailure,
    });
    await using ctx = root.openExecutionContext();

    const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
    await iterator.next();
    const terminal = await iterator.next();
    expect(terminal.value).toMatchObject({ kind: "unexpectedFailure" });
    expect(onUnexpectedFailure).toHaveBeenCalledOnce();
    expect(onUnexpectedFailure.mock.calls[0]![0]!.cause).toBe(boom);
    expect(onUnexpectedFailure.mock.calls[0]![0]!.failure).toBe(
      terminal.value?.kind === "unexpectedFailure" ? terminal.value.failure : undefined
    );

    // Propagating/consuming the terminal item does not re-notify.
    await iterator.next();
    expect(onUnexpectedFailure).toHaveBeenCalledOnce();

    await root.dispose();
  });

  it("stream factory failure becomes terminal unexpected on the materializing invocation", async () => {
    const boom = new Error("factory");
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(() => {
      throw boom;
    });

    const root = compose({
      entryBoundaries: [Orders],
      surface: { watchOrders: WatchProvider },
      onUnexpectedFailure,
    });
    await using ctx = root.openExecutionContext();

    const first = await ctx.surface.watchOrders()[Symbol.asyncIterator]().next();
    expect(first).toMatchObject({ done: false, value: { kind: "unexpectedFailure" } });
    expect(onUnexpectedFailure).toHaveBeenCalledOnce();
    expect(onUnexpectedFailure.mock.calls[0]![0]!.cause).toBe(boom);
    expect(onUnexpectedFailure.mock.calls[0]![0]!.phase).toBe("materialize");

    await root.dispose();
  });

  it("operation that throws synchronously when producing the iterable uses stream-start", async () => {
    const boom = new Error("sync start");
    const onUnexpectedFailure = vi.fn<OnUnexpectedFailure>();
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        function () {
          throw boom;
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { watchOrders: WatchProvider },
      onUnexpectedFailure,
    });
    await using ctx = root.openExecutionContext();

    const first = await ctx.surface.watchOrders()[Symbol.asyncIterator]().next();
    expect(first).toMatchObject({ done: false, value: { kind: "unexpectedFailure" } });
    expect(onUnexpectedFailure).toHaveBeenCalledOnce();
    expect(onUnexpectedFailure.mock.calls[0]![0]!.cause).toBe(boom);
    expect(onUnexpectedFailure.mock.calls[0]![0]!.phase).toBe("stream-start");

    await root.dispose();
  });

  it("early break and dispose keep the current lifecycle matrix", async () => {
    let finalizeCount = 0;
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          try {
            yield success({ orderId: "1", status: "open" });
            yield success({ orderId: "2", status: "paid" });
          } finally {
            finalizeCount += 1;
          }
        }
    );

    const root = compose({
      entryBoundaries: [Orders],
      surface: { watchOrders: WatchProvider },
    });
    const ctx = root.openExecutionContext();

    for await (const value of ctx.surface.watchOrders()) {
      if (value.kind === "success" && value.value.orderId === "1") {
        break;
      }
    }
    expect(finalizeCount).toBe(1);

    await expect(ctx.dispose()).resolves.toBeUndefined();
    await root.dispose();
  });
});
