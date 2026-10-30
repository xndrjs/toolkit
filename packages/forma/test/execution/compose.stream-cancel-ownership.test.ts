import { describe, expect, it, vi } from "vitest";
import { boundary, compose, ok } from "@xndrjs/forma";

type OrderEvent = { readonly orderId: string; readonly status: string };
type WatchError = { readonly kind: "unavailable" };

/** Cooperative hang: settles only when `signal` aborts. */
function abortableHang(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error("aborted"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => {
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true }
    );
  });
}

describe("compose — Stream Intent cancellation and ownership", () => {
  it("break triggers generator finally via return()", async () => {
    let finalized = false;
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          try {
            yield ok({ orderId: "1", status: "open" });
            yield ok({ orderId: "2", status: "paid" });
          } finally {
            finalized = true;
          }
        }
    );

    const root = compose({ surface: { watchOrders: WatchProvider } });
    const ctx = root.openExecutionContext();

    const seen: OrderEvent[] = [];
    for await (const event of ctx.surface.watchOrders()) {
      if (event.ok) {
        seen.push(event.value);
      }
      break;
    }

    expect(seen).toEqual([{ orderId: "1", status: "open" }]);
    expect(finalized).toBe(true);
    await expect(ctx.dispose()).resolves.toBeUndefined();
    await root.dispose();
  });

  it("asyncDispose shares the same cleanup path as break", async () => {
    let finalized = false;
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          try {
            yield ok({ orderId: "1", status: "open" });
            yield ok({ orderId: "2", status: "paid" });
          } finally {
            finalized = true;
          }
        }
    );

    const root = compose({ surface: { watchOrders: WatchProvider } });
    const ctx = root.openExecutionContext();

    const stream = ctx.surface.watchOrders();
    const iterator = stream[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ done: false });

    await stream[Symbol.asyncDispose]();

    expect(finalized).toBe(true);
    await expect(ctx.dispose()).resolves.toBeUndefined();
    await root.dispose();
  });

  it("explicit return() is idempotent", async () => {
    let finalizeCount = 0;
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* () {
          try {
            yield ok({ orderId: "1", status: "open" });
            yield ok({ orderId: "2", status: "paid" });
          } finally {
            finalizeCount += 1;
          }
        }
    );

    const root = compose({ surface: { watchOrders: WatchProvider } });
    const ctx = root.openExecutionContext();

    const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
    await iterator.next();

    const [a, b] = await Promise.all([iterator.return?.(), iterator.return?.()]);
    expect(a?.done).toBe(true);
    expect(b?.done).toBe(true);
    expect(finalizeCount).toBe(1);

    await expect(ctx.dispose()).resolves.toBeUndefined();
    await root.dispose();
  });

  it("context dispose closes active cooperative streams without deadlock", async () => {
    let finalized = false;
    let invocationAborted = false;
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* (_input, invocation) {
          invocation.signal.addEventListener(
            "abort",
            () => {
              invocationAborted = true;
            },
            { once: true }
          );
          try {
            yield ok({ orderId: "1", status: "open" });
            await abortableHang(invocation.signal);
            yield ok({ orderId: "2", status: "paid" });
          } finally {
            finalized = true;
          }
        }
    );

    const root = compose({ surface: { watchOrders: WatchProvider } });
    const ctx = root.openExecutionContext();

    const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: { ok: true, value: { orderId: "1", status: "open" } },
    });

    // Blocked on the next hang; dispose must abort + return, not wait forever.
    // Attach catch immediately: abort may reject before the consumer awaits.
    const pendingNext = iterator.next().then(
      () => undefined,
      () => undefined
    );
    await expect(ctx.dispose()).resolves.toBeUndefined();
    expect(finalized).toBe(true);
    expect(invocationAborted).toBe(true);
    await pendingNext;

    await root.dispose();
  });

  it("root dispose closes open contexts and streams before composition Providers", async () => {
    const order: string[] = [];
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(({ lifetime }) => {
      lifetime.onDispose(() => {
        order.push("provider");
      });
      return async function* (_input, invocation) {
        try {
          yield ok({ orderId: "1", status: "open" });
          await abortableHang(invocation.signal);
        } finally {
          order.push("stream");
        }
      };
    });

    const root = compose({ surface: { watchOrders: WatchProvider } });
    const ctx = root.openExecutionContext();

    const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
    await iterator.next();
    const pendingNext = iterator.next().then(
      () => undefined,
      () => undefined
    );

    await expect(root.dispose()).resolves.toBeUndefined();

    expect(order).toEqual(["stream", "provider"]);
    await pendingNext;
  });

  it("host abort reaches StreamInvocation.signal without auto-disposing the context", async () => {
    let finalized = false;
    let invocationAborted = false;
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.with(
      () =>
        async function* (_input, invocation) {
          invocation.signal.addEventListener(
            "abort",
            () => {
              invocationAborted = true;
            },
            { once: true }
          );
          try {
            yield ok({ orderId: "1", status: "open" });
            await abortableHang(invocation.signal);
          } finally {
            finalized = true;
          }
        }
    );

    const host = new AbortController();
    const root = compose({ surface: { watchOrders: WatchProvider } });
    const ctx = root.openExecutionContext({ signal: host.signal });

    const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
    await iterator.next();
    const pendingNext = iterator.next().then(
      () => undefined,
      () => undefined
    );

    host.abort();

    await vi.waitFor(() => {
      expect(invocationAborted).toBe(true);
      expect(finalized).toBe(true);
    });
    expect(ctx.signal.aborted).toBe(true);
    // abort ≠ dispose: context remains usable for dispose; phase still accepting dispose.
    await expect(ctx.dispose()).resolves.toBeUndefined();
    await pendingNext;
    await root.dispose();
  });

  it("cancelling one stream does not abort sibling streams or the context", async () => {
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
          yield ok({ orderId: input.tag, status: "still-open" });
        }
    );

    const root = compose({ surface: { watchOrders: WatchProvider } });
    const ctx = root.openExecutionContext();

    const streamA = ctx.surface.watchOrders({ tag: "a" });
    const streamB = ctx.surface.watchOrders({ tag: "b" });
    const iterA = streamA[Symbol.asyncIterator]();
    const iterB = streamB[Symbol.asyncIterator]();

    await expect(iterA.next()).resolves.toMatchObject({
      value: { ok: true, value: { orderId: "a", status: "open" } },
    });
    await expect(iterB.next()).resolves.toMatchObject({
      value: { ok: true, value: { orderId: "b", status: "open" } },
    });

    await streamA[Symbol.asyncDispose]();

    expect(ctx.signal.aborted).toBe(false);
    await expect(iterB.next()).resolves.toMatchObject({
      value: { ok: true, value: { orderId: "b", status: "still-open" } },
    });
    await expect(iterB.next()).resolves.toMatchObject({ done: true });

    await expect(ctx.dispose()).resolves.toBeUndefined();
    await root.dispose();
  });

  it("composition-effective stream stays context-owned (invocation signal ≠ Lifetime.signal)", async () => {
    let providerDisposed = false;
    let streamFinalized = false;
    let lifetimeSignal: AbortSignal | undefined;
    let invocationSignal: AbortSignal | undefined;

    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    // Default `auto` with no context deps → composition-effective Provider.
    const WatchProvider = WatchOrders.provide.with(({ lifetime }) => {
      lifetimeSignal = lifetime.signal;
      lifetime.onDispose(() => {
        providerDisposed = true;
      });
      return async function* (_input, invocation) {
        invocationSignal = invocation.signal;
        try {
          yield ok({ orderId: "1", status: "open" });
          await abortableHang(invocation.signal);
        } finally {
          streamFinalized = true;
        }
      };
    });

    const root = compose({ surface: { watchOrders: WatchProvider } });
    expect(root.describePlan().providers).toEqual([
      {
        intent: ["orders", "watchOrders"],
        mode: "stream",
        declared: "auto",
        effective: "composition",
      },
    ]);

    const ctx = root.openExecutionContext();
    const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
    await iterator.next();

    expect(lifetimeSignal).toBeDefined();
    expect(invocationSignal).toBeDefined();
    expect(invocationSignal).not.toBe(lifetimeSignal);
    expect(invocationSignal).not.toBe(ctx.signal);

    await expect(ctx.dispose()).resolves.toBeUndefined();

    expect(streamFinalized).toBe(true);
    expect(invocationSignal!.aborted).toBe(true);
    // Composition Provider survives context dispose.
    expect(providerDisposed).toBe(false);
    expect(lifetimeSignal!.aborted).toBe(false);

    await root.dispose();
    expect(providerDisposed).toBe(true);
    expect(lifetimeSignal!.aborted).toBe(true);
  });

  it("after break, context dispose settles (lease already released)", async () => {
    const Orders = boundary("orders");
    const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
    const WatchProvider = WatchOrders.provide.perContext().with(({ lifetime }) => {
      lifetime.onDispose(() => {
        /* context-owned */
      });
      return async function* () {
        yield ok({ orderId: "1", status: "open" });
        yield ok({ orderId: "2", status: "paid" });
      };
    });

    const root = compose({ surface: { watchOrders: WatchProvider } });
    const ctx = root.openExecutionContext();

    for await (const _ of ctx.surface.watchOrders()) {
      break;
    }

    await expect(ctx.dispose()).resolves.toBeUndefined();
    await root.dispose();
  });
});
