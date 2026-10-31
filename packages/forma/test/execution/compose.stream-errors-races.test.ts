import { describe, expect, it, vi } from "vitest";
import { boundary, compose, expectedError, isUnexpectedFailure, success } from "@xndrjs/forma";

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
    it("emits expectedError once and terminates (wrapper enforce)", async () => {
      let yieldedAfterErr = false;
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(
        () =>
          async function* () {
            yield success({ orderId: "1", status: "open" });
            yield expectedError({ kind: "unavailable" });
            yieldedAfterErr = true;
            yield success({ orderId: "2", status: "paid" });
          }
      );

      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
      });
      const ctx = root.openExecutionContext();

      const values = [];
      for await (const value of ctx.surface.watchOrders()) {
        values.push(value);
      }

      expect(values).toEqual([
        { kind: "success", value: { orderId: "1", status: "open" } },
        { kind: "error", error: { kind: "unavailable" } },
      ]);
      expect(yieldedAfterErr).toBe(false);

      await expect(ctx.dispose()).resolves.toBeUndefined();
      await root.dispose();
    });

    it("suppresses yields after expectedError so they are not observable", async () => {
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(
        () =>
          async function* () {
            yield expectedError({ kind: "unavailable" });
            yield success({ orderId: "ghost", status: "should-not-appear" });
          }
      );

      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
      });
      await using ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toEqual({
        done: false,
        value: { kind: "error", error: { kind: "unavailable" } },
      });
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    });
  });

  describe("throw paths", () => {
    it("throw before the first yield becomes terminal unexpected and releases the lease", async () => {
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
            yield success({ orderId: "1", status: "open" });
          } finally {
            finalized = true;
          }
        };
      });

      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
        onUnexpectedFailure: () => undefined,
      });
      const ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.done).toBe(false);
      expect(first.value).toMatchObject({ kind: "unexpected" });
      if (first.value?.kind === "unexpected") {
        expect(isUnexpectedFailure(first.value.failure)).toBe(true);
      }
      expect(finalized).toBe(true);
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });

      // Lease released on the error path — dispose must not hang.
      await expect(ctx.dispose()).resolves.toBeUndefined();
      await root.dispose();
    });

    it("throw after yields becomes a single terminal unexpected and cleans up", async () => {
      let finalized = false;
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const WatchProvider = WatchOrders.provide.with(
        () =>
          async function* () {
            try {
              yield success({ orderId: "1", status: "open" });
              throw new Error("boom after yield");
            } finally {
              finalized = true;
            }
          }
      );

      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
        onUnexpectedFailure: () => undefined,
      });
      const ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toMatchObject({
        done: false,
        value: { kind: "success", value: { orderId: "1", status: "open" } },
      });
      const terminal = await iterator.next();
      expect(terminal).toMatchObject({
        done: false,
        value: { kind: "unexpected" },
      });
      expect(finalized).toBe(true);
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });

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
                  value: success({ orderId: "1", status: "open" }),
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

      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
      });
      const ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await iterator.next();
      await expect(iterator.return?.()).rejects.toThrow(/cleanup failed/);

      await expect(ctx.dispose()).resolves.toBeUndefined();
      await root.dispose();
    });

    it("source iteration failure is totalized; cleanup failure stays on the lifecycle channel", async () => {
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
                  value: success({ orderId: "1", status: "open" }),
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

      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
        onUnexpectedFailure: () => undefined,
      });
      const ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await iterator.next();
      // Source throw is totalized by the Boundary wrap; managed close then observes
      // cleanup failure on the lifecycle channel (Contract does not carry cleanup).
      await expect(iterator.next()).rejects.toThrow(/cleanup failed/);

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
          yield success({ orderId: "recovered", status: "open" });
        };
      });

      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
        onUnexpectedFailure: () => undefined,
      });
      const ctx = root.openExecutionContext();

      const failed = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      const outcome = await failed.next();
      expect(outcome).toMatchObject({ done: false, value: { kind: "unexpected" } });

      // No residual registration/lease: dispose settles and a new stream can start.
      await expect(ctx.dispose()).resolves.toBeUndefined();

      const ctx2 = root.openExecutionContext();
      const events: OrderEvent[] = [];
      for await (const event of ctx2.surface.watchOrders()) {
        if (event.kind === "success") {
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
          yield success({ orderId: "success", status: "open" });
        };
      });

      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
        onUnexpectedFailure: () => undefined,
      });
      await using ctx = root.openExecutionContext();

      const failed = await ctx.surface.watchOrders()[Symbol.asyncIterator]().next();
      expect(failed).toMatchObject({ done: false, value: { kind: "unexpected" } });

      const values = [];
      for await (const value of ctx.surface.watchOrders()) {
        values.push(value);
      }
      expect(values).toEqual([{ kind: "success", value: { orderId: "success", status: "open" } }]);
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
            yield success({ orderId: "1", status: "open" });
            await abortableHang(invocation.signal);
          } finally {
            finalizeCount += 1;
          }
        };
      });

      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
      });
      const ctx = root.openExecutionContext();

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      const nextPromise = iterator.next().then(
        (result) => ({ success: true as const, result }),
        (error: unknown) => ({ success: false as const, error })
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
              yield success({ orderId: "1", status: "open" });
              await abortableHang(invocation.signal);
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
              yield success({ orderId: "1", status: "open" });
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

      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      // Ensure the stream is active (lease held) before racing completion with dispose.
      await expect(iterator.next()).resolves.toMatchObject({
        done: false,
        value: { kind: "success", value: { orderId: "1", status: "open" } },
      });

      // Race: natural completion of the generator vs context dispose.
      const completion = iterator.next().then(
        (result) => ({ success: true as const, result }),
        (error: unknown) => ({ success: false as const, error })
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
            yield success({ orderId: input.tag, status: "open" });
            if (input.tag === "bad") {
              throw new Error("bad stream");
            }
            yield success({ orderId: input.tag, status: "paid" });
          }
      );

      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
        onUnexpectedFailure: () => undefined,
      });
      await using ctx = root.openExecutionContext();

      const bad = ctx.surface.watchOrders({ tag: "bad" })[Symbol.asyncIterator]();
      const good = ctx.surface.watchOrders({ tag: "good" })[Symbol.asyncIterator]();

      await expect(bad.next()).resolves.toMatchObject({
        value: { kind: "success", value: { orderId: "bad", status: "open" } },
      });
      await expect(good.next()).resolves.toMatchObject({
        value: { kind: "success", value: { orderId: "good", status: "open" } },
      });

      await expect(bad.next()).resolves.toMatchObject({
        value: { kind: "unexpected" },
      });

      await expect(good.next()).resolves.toMatchObject({
        value: { kind: "success", value: { orderId: "good", status: "paid" } },
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
            return success({ orderId: "u", status: "found" });
          }
      );
      const WatchProvider = WatchOrders.provide.with(
        () =>
          async function* (_input, invocation) {
            try {
              yield success({ orderId: "s", status: "open" });
              await abortableHang(invocation.signal);
            } finally {
              streamFinalized = true;
            }
          }
      );

      const root = compose({
        entryBoundaries: [Orders],
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
        kind: "success",
        value: { orderId: "u", status: "found" },
      });
      expect(unaryDone).toBe(true);
      expect(streamFinalized).toBe(true);
      await pendingNext;

      await root.dispose();
    });
  });

  describe("abort acceptance and cleanup ownership", () => {
    it("does not materialize or start a cold stream after host abort", async () => {
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      let materializations = 0;
      let starts = 0;
      const WatchProvider = WatchOrders.provide.with(() => {
        materializations += 1;
        return async function* () {
          starts += 1;
          yield success({ orderId: "1", status: "open" });
        };
      });
      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
      });
      const host = new AbortController();
      const ctx = root.openExecutionContext({ signal: host.signal });
      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();

      host.abort(new Error("host stopped"));

      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
      expect(materializations).toBe(0);
      expect(starts).toBe(0);

      await ctx.dispose();
      await root.dispose();
    });

    it("retains an abort-driven close failure for context dispose without unhandled rejection", async () => {
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<void, OrderEvent, WatchError>();
      const streamFailure = new Error("stream cleanup failed");
      let providerDisposed = false;
      const WatchProvider = WatchOrders.provide.perContext().with(({ lifetime }) => {
        lifetime.onDispose(() => {
          providerDisposed = true;
        });
        return () => ({
          [Symbol.asyncIterator]() {
            return {
              async next() {
                return {
                  done: false as const,
                  value: success({ orderId: "1", status: "open" }),
                };
              },
              async return() {
                throw streamFailure;
              },
            };
          },
        });
      });
      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
      });
      const host = new AbortController();
      const ctx = root.openExecutionContext({ signal: host.signal });
      const iterator = ctx.surface.watchOrders()[Symbol.asyncIterator]();
      await iterator.next();

      const unhandled: unknown[] = [];
      const onUnhandled = (error: unknown) => unhandled.push(error);
      process.on("unhandledRejection", onUnhandled);
      try {
        host.abort(new Error("host stopped"));
        await expect(iterator.next()).rejects.toBe(streamFailure);
        await expect(ctx.dispose()).rejects.toBe(streamFailure);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(unhandled).toEqual([]);
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }

      expect(providerDisposed).toBe(true);
      await root.dispose();
    });

    it("aggregates every stream cleanup failure and still runs Provider disposers", async () => {
      const Orders = boundary("orders");
      const WatchOrders = Orders.stream("watchOrders").contract<string, OrderEvent, WatchError>();
      const providerFailure = new Error("provider cleanup failed");
      let providerDisposeCalls = 0;
      const WatchProvider = WatchOrders.provide.perContext().with(({ lifetime }) => {
        lifetime.onDispose(() => {
          providerDisposeCalls += 1;
          throw providerFailure;
        });
        return (tag) => ({
          [Symbol.asyncIterator]() {
            return {
              async next() {
                return {
                  done: false as const,
                  value: success({ orderId: tag, status: "open" }),
                };
              },
              async return() {
                throw new Error(`stream cleanup failed: ${tag}`);
              },
            };
          },
        });
      });
      const root = compose({
        entryBoundaries: [Orders],
        surface: { watchOrders: WatchProvider },
      });
      const ctx = root.openExecutionContext();
      const first = ctx.surface.watchOrders("first")[Symbol.asyncIterator]();
      const second = ctx.surface.watchOrders("second")[Symbol.asyncIterator]();
      await first.next();
      await second.next();

      try {
        await ctx.dispose();
        expect.unreachable("expected AggregateError");
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        const messages = (error as AggregateError).errors.map((cause) => (cause as Error).message);
        expect(messages).toEqual(
          expect.arrayContaining([
            "stream cleanup failed: first",
            "stream cleanup failed: second",
            "provider cleanup failed",
          ])
        );
        expect(messages).toHaveLength(3);
      }

      expect(providerDisposeCalls).toBe(1);
      await root.dispose();
    });
  });
});
