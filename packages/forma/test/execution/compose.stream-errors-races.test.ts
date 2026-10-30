import { describe, expect, it, vi } from "vitest";
import { boundary, compose, err, ok } from "@xndrjs/forma";

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

describe("compose — Stream Intent errors and races", () => {
  describe("Err terminal enforcement", () => {
    it("emits err once and terminates (wrapper enforce)", async () => {
      let yieldedAfterErr = false;
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(
        () =>
          async function* () {
            yield ok({ orderId: "1", status: "open" });
            yield err({ kind: "unavailable" });
            yieldedAfterErr = true;
            yield ok({ orderId: "2", status: "paid" });
          }
      );

      const root = compose({ surface: { watchOrders: WatchProvider } });
      const ctx = root.openExecutionContext();

      const values = [];
      for await (const value of ctx.surface.watchOrders()) {
        values.push(value);
      }

      expect(values).toEqual([
        { ok: true, value: { orderId: "1", status: "open" } },
        { ok: false, error: { kind: "unavailable" } },
      ]);
      expect(yieldedAfterErr).toBe(false);

      await expect(ctx.dispose()).resolves.toBeUndefined();
      await root.dispose();
    });

    it("suppresses yields after err so they are not observable", async () => {
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(
        () =>
          async function* () {
            yield err({ kind: "unavailable" });
            yield ok({ orderId: "ghost", status: "should-not-appear" });
          }
      );

      const root = compose({ surface: { watchOrders: WatchProvider } });
      await using ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { ok: false, error: { kind: "unavailable" } },
      });
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    });
  });

  describe("throw paths", () => {
    it("throw before the first yield rejects next() and releases the lease", async () => {
      let finalized = false;
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.perContext().with(({ lifetime }) => {
        lifetime.onDispose(() => {
          /* context-owned */
        });
        return async function* () {
          try {
            throw new Error("boom before yield");
            yield ok({ orderId: "1", status: "open" });
          } finally {
            finalized = true;
          }
        };
      });

      const root = compose({ surface: { watchOrders: WatchProvider } });
      const ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(/boom before yield/);
      expect(finalized).toBe(true);

      // Lease released on the error path — dispose must not hang.
      await expect(ctx.dispose()).resolves.toBeUndefined();
      await root.dispose();
    });

    it("throw after yields rejects the current next() and cleans up", async () => {
      let finalized = false;
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(
        () =>
          async function* () {
            try {
              yield ok({ orderId: "1", status: "open" });
              throw new Error("boom after yield");
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
      await expect(iterator.next()).rejects.toThrow(/boom after yield/);
      expect(finalized).toBe(true);

      await expect(ctx.dispose()).resolves.toBeUndefined();
      await root.dispose();
    });
  });

  describe("disposal error matrix", () => {
    it("propagates cleanup failure from inner.return()", async () => {
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(() => (_input, _invocation) => ({
        [Symbol.asyncIterator]() {
          let yielded = false;
          return {
            async next() {
              if (!yielded) {
                yielded = true;
                return {
                  done: false as const,
                  value: ok({ orderId: "1", status: "open" }),
                };
              }
              return { done: true as const, value: undefined };
            },
            async return() {
              throw new Error("cleanup failed");
            },
          };
        },
      }));

      const root = compose({ surface: { watchOrders: WatchProvider } });
      const ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await iterator.next();
      await expect(iterator.return?.()).rejects.toThrow(/cleanup failed/);

      await expect(ctx.dispose()).resolves.toBeUndefined();
      await root.dispose();
    });

    it("iteration failure + cleanup failure → SuppressedError(cleanup, iteration)", async () => {
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(() => (_input, _invocation) => ({
        [Symbol.asyncIterator]() {
          let step = 0;
          return {
            async next() {
              if (step++ === 0) {
                return {
                  done: false as const,
                  value: ok({ orderId: "1", status: "open" }),
                };
              }
              throw new Error("iteration failed");
            },
            async return() {
              throw new Error("cleanup failed");
            },
          };
        },
      }));

      const root = compose({ surface: { watchOrders: WatchProvider } });
      const ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await iterator.next();
      try {
        await iterator.next();
        expect.unreachable("expected SuppressedError");
      } catch (error) {
        expect(error).toBeInstanceOf(SuppressedError);
        const suppressed = error as SuppressedError;
        expect(suppressed.error).toMatchObject({ message: "cleanup failed" });
        expect(suppressed.suppressed).toMatchObject({ message: "iteration failed" });
      }

      await expect(ctx.dispose()).resolves.toBeUndefined();
      await root.dispose();
    });
  });

  describe("materialize failure", () => {
    it("does not leave a residual active stream or lease", async () => {
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      let attempts = 0;
      const WatchProvider = WatchOrders.provide.with(() => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("materialize failed");
        }
        return async function* () {
          yield ok({ orderId: "recovered", status: "open" });
        };
      });

      const root = compose({ surface: { watchOrders: WatchProvider } });
      const ctx = root.openExecutionContext();

      const failed = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await expect(failed.next()).rejects.toThrow(/materialize failed/);

      // No residual registration/lease: dispose settles and a new stream can start.
      await expect(ctx.dispose()).resolves.toBeUndefined();

      const ctx2 = root.openExecutionContext();
      const events: OrderEvent[] = [];
      for await (const event of ctx2.surface.watchOrders()) {
        if (event.ok) {
          events.push(event.value);
        }
      }
      expect(events).toEqual([{ orderId: "recovered", status: "open" }]);
      expect(attempts).toBe(2);

      await ctx2.dispose();
      await root.dispose();
    });

    it("failed materialize on an open context still allows a later stream", async () => {
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      let attempts = 0;
      const WatchProvider = WatchOrders.provide.with(async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("setup boom");
        }
        return async function* () {
          yield ok({ orderId: "ok", status: "open" });
        };
      });

      const root = compose({ surface: { watchOrders: WatchProvider } });
      await using ctx = root.openExecutionContext();

      await expect(ctx.surface.watchOrders()[Symbol.asyncIterator]().next()).rejects.toThrow(
        /setup boom/
      );

      const values = [];
      for await (const value of ctx.surface.watchOrders()) {
        values.push(value);
      }
      expect(values).toEqual([{ ok: true, value: { orderId: "ok", status: "open" } }]);
      expect(attempts).toBe(2);
    });
  });

  describe("races and release-once", () => {
    it("dispose during the first next() (mid-start) settles without residual lease", async () => {
      let continueStart!: () => void;
      const gate = new Promise<void>((resolve) => {
        continueStart = resolve;
      });
      let factoryEntered = false;
      let finalizeCount = 0;

      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(async () => {
        factoryEntered = true;
        await gate;
        return async function* (_input, invocation) {
          try {
            yield ok({ orderId: "1", status: "open" });
            await abortableHang(invocation.signal);
          } finally {
            finalizeCount += 1;
          }
        };
      });

      const root = compose({ surface: { watchOrders: WatchProvider } });
      const ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      const nextPromise = iterator.next().then(
        (result) => ({ ok: true as const, result }),
        (error: unknown) => ({ ok: false as const, error })
      );

      await vi.waitFor(() => expect(factoryEntered).toBe(true));

      const disposePromise = ctx.dispose();
      continueStart();

      await expect(disposePromise).resolves.toBeUndefined();
      await nextPromise;
      // Start held a lease through materialize; release-once must have completed.
      expect(finalizeCount).toBeLessThanOrEqual(1);

      await root.dispose();
    });

    it("dispose during a blocked next() aborts and releases once", async () => {
      let finalizeCount = 0;
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(
        () =>
          async function* (_input, invocation) {
            try {
              yield ok({ orderId: "1", status: "open" });
              await abortableHang(invocation.signal);
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
      const pendingNext = iterator.next().then(
        () => undefined,
        () => undefined
      );

      await expect(ctx.dispose()).resolves.toBeUndefined();
      expect(finalizeCount).toBe(1);
      await pendingNext;

      await root.dispose();
    });

    it("natural completion and concurrent context dispose release the lease once", async () => {
      let finalizeCount = 0;
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(
        () =>
          async function* () {
            try {
              yield ok({ orderId: "1", status: "open" });
            } finally {
              finalizeCount += 1;
            }
          }
      );

      const root = compose({ surface: { watchOrders: WatchProvider } });
      const ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      // Ensure the stream is active (lease held) before racing completion with dispose.
      await expect(iterator.next()).resolves.toMatchObject({
        done: false,
        value: { ok: true, value: { orderId: "1", status: "open" } },
      });

      // Race: natural completion of the generator vs context dispose.
      const completion = iterator.next().then(
        (result) => ({ ok: true as const, result }),
        (error: unknown) => ({ ok: false as const, error })
      );
      const [, disposeResult] = await Promise.all([completion, ctx.dispose()]);
      expect(disposeResult).toBeUndefined();
      expect(finalizeCount).toBe(1);

      await root.dispose();
    });

    it("concurrent return() and dispose share one close (release-once)", async () => {
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

      const stream = ctx.surface.watchOrders();
      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();

      await Promise.all([iterator.return?.(), stream[Symbol.asyncDispose](), ctx.dispose()]);

      expect(finalizeCount).toBe(1);
      await root.dispose();
    });

    it("multiple streams on the same Provider do not interfere on error", async () => {
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
            if (input.tag === "bad") {
              throw new Error("bad stream");
            }
            yield ok({ orderId: input.tag, status: "paid" });
          }
      );

      const root = compose({ surface: { watchOrders: WatchProvider } });
      await using ctx = root.openExecutionContext();

      const bad = ctx.surface.watchOrders({ tag: "bad" })[Symbol.asyncIterator]();
      const good = ctx.surface.watchOrders({ tag: "good" })[Symbol.asyncIterator]();

      await expect(bad.next()).resolves.toMatchObject({
        value: { ok: true, value: { orderId: "bad", status: "open" } },
      });
      await expect(good.next()).resolves.toMatchObject({
        value: { ok: true, value: { orderId: "good", status: "open" } },
      });

      await expect(bad.next()).rejects.toThrow(/bad stream/);

      await expect(good.next()).resolves.toMatchObject({
        value: { ok: true, value: { orderId: "good", status: "paid" } },
      });
      await expect(good.next()).resolves.toMatchObject({ done: true });
    });

    it("concurrent unary invocation and stream are both drained on dispose", async () => {
      let unaryDone = false;
      let streamFinalized = false;
      let releaseUnary!: () => void;
      const holdUnary = new Promise<void>((resolve) => {
        releaseUnary = resolve;
      });

      const Orders = boundary("orders");
      const FindOrder = Orders.intent("find").contract<void, OrderEvent, WatchError>();
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();

      const FindProvider = FindOrder.provide.with(
        () =>
          async function () {
            await holdUnary;
            unaryDone = true;
            return ok({ orderId: "u", status: "found" });
          }
      );
      const WatchProvider = WatchOrders.provide.with(
        () =>
          async function* (_input, invocation) {
            try {
              yield ok({ orderId: "s", status: "open" });
              await abortableHang(invocation.signal);
            } finally {
              streamFinalized = true;
            }
          }
      );

      const root = compose({
        surface: { findOrder: FindProvider, watchOrders: WatchProvider },
      });
      const ctx = root.openExecutionContext();

      const unaryPromise = ctx.surface.findOrder();
      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await iterator.next();
      const pendingNext = iterator.next().then(
        () => undefined,
        () => undefined
      );

      // Dispose while unary is leased and stream is blocked.
      const disposePromise = ctx.dispose();
      // Unary must be allowed to finish (drain accepted work) — release it.
      releaseUnary();

      await expect(disposePromise).resolves.toBeUndefined();
      await expect(unaryPromise).resolves.toEqual({
        ok: true,
        value: { orderId: "u", status: "found" },
      });
      expect(unaryDone).toBe(true);
      expect(streamFinalized).toBe(true);
      await pendingNext;

      await root.dispose();
    });
  });
});
