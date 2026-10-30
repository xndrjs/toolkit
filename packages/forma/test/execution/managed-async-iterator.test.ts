import { describe, expect, it, vi } from "vitest";
import {
  createManagedAsyncIterable,
  createManagedResultIterable,
} from "../../src/execution/managed-async-iterator.js";
import { err, ok } from "../../src/result.js";

/** Cooperative hang: async generators only reach `finally` after the current await settles. */
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

describe("ManagedAsyncIterator", () => {
  describe("cold start and consumption", () => {
    it("does not call start until the first next()", async () => {
      const start = vi.fn(async function* () {
        yield 1;
      });

      const stream = createManagedAsyncIterable(start);
      expect(stream.phase).toBe("idle");
      expect(start).not.toHaveBeenCalled();

      const iterator = stream[Symbol.asyncIterator]();
      expect(start).not.toHaveBeenCalled();

      await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
      expect(start).toHaveBeenCalledOnce();
      expect(stream.phase).toBe("active");
    });

    it("yields multiple values and closes on natural completion", async () => {
      let closed = 0;
      const stream = createManagedAsyncIterable(
        async function* () {
          yield "a";
          yield "b";
        },
        {
          onStarted: () => {
            /* lease acquired */
          },
          onClosed: () => {
            closed += 1;
          },
        }
      );

      const values: string[] = [];
      for await (const value of stream) {
        values.push(value);
      }

      expect(values).toEqual(["a", "b"]);
      expect(stream.phase).toBe("closed");
      expect(closed).toBe(1);
    });

    it("rejects a second consumer of the same iterable", async () => {
      const stream = createManagedAsyncIterable(async function* () {
        yield 1;
      });

      stream[Symbol.asyncIterator]();
      expect(() => stream[Symbol.asyncIterator]()).toThrow(/single-consumer/);
    });

    it("dispose while idle closes without calling start or onClosed", async () => {
      const start = vi.fn(async function* () {
        yield 1;
      });
      const onClosed = vi.fn();
      const stream = createManagedAsyncIterable(start, { onClosed });

      await stream[Symbol.asyncDispose]();

      expect(stream.phase).toBe("closed");
      expect(start).not.toHaveBeenCalled();
      expect(onClosed).not.toHaveBeenCalled();
    });
  });

  describe("cancellation and dispose", () => {
    it("does not start when the parent signal is already aborted", async () => {
      const parent = AbortSignal.abort(new Error("already stopped"));
      const start = vi.fn(async function* () {
        yield 1;
      });
      const onStarted = vi.fn();
      const onClosed = vi.fn();
      const stream = createManagedAsyncIterable(start, {
        signal: parent,
        onStarted,
        onClosed,
      });

      const iterator = stream[Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });

      expect(start).not.toHaveBeenCalled();
      expect(onStarted).not.toHaveBeenCalled();
      expect(onClosed).not.toHaveBeenCalled();
      expect(stream.phase).toBe("closed");
    });

    it("break triggers generator finally via return()", async () => {
      let finalized = false;
      const stream = createManagedAsyncIterable(async function* () {
        try {
          yield 1;
          yield 2;
          yield 3;
        } finally {
          finalized = true;
        }
      });

      const seen: number[] = [];
      for await (const value of stream) {
        seen.push(value);
        if (value === 1) {
          break;
        }
      }

      expect(seen).toEqual([1]);
      expect(finalized).toBe(true);
      expect(stream.phase).toBe("closed");
    });

    it("asyncDispose shares the same cleanup path", async () => {
      let finalized = false;
      const stream = createManagedAsyncIterable(async function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          finalized = true;
        }
      });

      const iterator = stream[Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });

      await stream[Symbol.asyncDispose]();

      expect(finalized).toBe(true);
      expect(stream.phase).toBe("closed");
      await expect(iterator.next()).resolves.toEqual({
        done: true,
        value: undefined,
      });
    });

    it("return() is idempotent and concurrent callers share one close", async () => {
      let finalizeCount = 0;
      const stream = createManagedAsyncIterable(async function* () {
        try {
          yield 1;
          yield 2;
        } finally {
          finalizeCount += 1;
        }
      });

      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();

      const [a, b] = await Promise.all([iterator.return?.(), iterator.return?.()]);
      await stream[Symbol.asyncDispose]();

      expect(a?.done).toBe(true);
      expect(b?.done).toBe(true);
      expect(finalizeCount).toBe(1);
      expect(stream.phase).toBe("closed");
    });

    it("parent signal abort closes the stream without requiring dispose", async () => {
      const parent = new AbortController();
      let finalized = false;
      let sawAbort = false;

      const stream = createManagedAsyncIterable(
        async function* (signal) {
          signal.addEventListener(
            "abort",
            () => {
              sawAbort = true;
            },
            { once: true }
          );
          try {
            yield 1;
            yield 2;
          } finally {
            finalized = true;
          }
        },
        { signal: parent.signal }
      );

      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();
      parent.abort();

      await vi.waitFor(() => expect(stream.phase).toBe("closed"));
      expect(sawAbort).toBe(true);
      expect(finalized).toBe(true);
    });

    it("per-stream abort unblocks cooperative I/O before finally", async () => {
      let finalized = false;
      const stream = createManagedAsyncIterable(async function* (signal) {
        try {
          yield 1;
          await abortableHang(signal);
          yield 2;
        } finally {
          finalized = true;
        }
      });

      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();
      await stream[Symbol.asyncDispose]();

      expect(finalized).toBe(true);
      expect(stream.phase).toBe("closed");
    });
  });

  describe("Err terminal enforcement", () => {
    it("delivers err once and suppresses subsequent yields", async () => {
      let yieldedAfterErr = false;
      const stream = createManagedResultIterable(async function* () {
        yield ok(1);
        yield err("boom");
        yieldedAfterErr = true;
        yield ok(2);
      });

      const values = [];
      for await (const value of stream) {
        values.push(value);
      }

      expect(values).toEqual([ok(1), err("boom")]);
      expect(yieldedAfterErr).toBe(false);
      expect(stream.phase).toBe("closed");
    });

    it("does not enforce terminal err on the generic wrapper", async () => {
      const stream = createManagedAsyncIterable(async function* () {
        yield err("a");
        yield ok(1);
      });

      const values = [];
      for await (const value of stream) {
        values.push(value);
      }

      expect(values).toEqual([err("a"), ok(1)]);
    });
  });

  describe("errors and disposal matrix", () => {
    it("treats onStartAccepted as transactional and never starts the source on failure", async () => {
      const acceptanceError = new Error("registry rejected start");
      const start = vi.fn(async function* () {
        yield 1;
      });
      let registered = false;
      const onClosed = vi.fn(() => {
        registered = false;
      });
      const stream = createManagedAsyncIterable(start, {
        onStartAccepted: () => {
          registered = true;
          throw acceptanceError;
        },
        onClosed,
      });

      const iterator = stream[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toBe(acceptanceError);
      expect(start).not.toHaveBeenCalled();
      expect(registered).toBe(false);
      expect(onClosed).toHaveBeenCalledOnce();
      expect(stream.phase).toBe("closed");

      await stream[Symbol.asyncDispose]();
      expect(onClosed).toHaveBeenCalledOnce();
    });

    it("combines onStartAccepted and rollback failures with SuppressedError", async () => {
      const start = vi.fn(async function* () {
        yield 1;
      });
      const stream = createManagedAsyncIterable(start, {
        onStartAccepted: () => {
          throw new Error("acceptance failed");
        },
        onClosed: () => {
          throw new Error("rollback failed");
        },
      });

      const iterator = stream[Symbol.asyncIterator]();
      try {
        await iterator.next();
        expect.unreachable("expected SuppressedError");
      } catch (error) {
        expect(error).toBeInstanceOf(SuppressedError);
        const suppressed = error as SuppressedError;
        expect(suppressed.error).toMatchObject({ message: "rollback failed" });
        expect(suppressed.suppressed).toMatchObject({ message: "acceptance failed" });
      }
      expect(start).not.toHaveBeenCalled();
      expect(stream.phase).toBe("closed");
    });

    it("propagates throw before the first yield and runs onClosed", async () => {
      const onClosed = vi.fn();
      const stream = createManagedAsyncIterable(
        async function* () {
          throw new Error("boom");
          yield 1;
        },
        { onClosed }
      );

      const iterator = stream[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(/boom/);
      expect(onClosed).toHaveBeenCalledOnce();
      expect(stream.phase).toBe("closed");
    });

    it("propagates throw after yields and runs generator finally", async () => {
      let finalized = false;
      const stream = createManagedAsyncIterable(async function* () {
        try {
          yield 1;
          throw new Error("later");
        } finally {
          finalized = true;
        }
      });

      const iterator = stream[Symbol.asyncIterator]();
      await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
      await expect(iterator.next()).rejects.toThrow(/later/);
      expect(finalized).toBe(true);
      expect(stream.phase).toBe("closed");
    });

    it("start failure + cleanup failure → SuppressedError(cleanup, start)", async () => {
      const stream = createManagedAsyncIterable(
        async () => {
          throw new Error("start failed");
        },
        {
          onClosed: () => {
            throw new Error("cleanup failed");
          },
        }
      );

      const iterator = stream[Symbol.asyncIterator]();
      try {
        await iterator.next();
        expect.unreachable("expected SuppressedError");
      } catch (error) {
        expect(error).toBeInstanceOf(SuppressedError);
        const suppressed = error as SuppressedError;
        expect(suppressed.error).toMatchObject({ message: "cleanup failed" });
        expect(suppressed.suppressed).toMatchObject({ message: "start failed" });
      }
      expect(stream.phase).toBe("closed");
    });

    it("iteration failure + cleanup failure → SuppressedError(cleanup, iteration)", async () => {
      const stream = createManagedAsyncIterable(
        async function* () {
          yield 1;
          throw new Error("iteration failed");
        },
        {
          onClosed: () => {
            throw new Error("cleanup failed");
          },
        }
      );

      const iterator = stream[Symbol.asyncIterator]();
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
    });

    it("inner.return failure + onClosed failure → AggregateError", async () => {
      const stream = createManagedAsyncIterable(
        () => ({
          async next() {
            return { done: false, value: 1 };
          },
          async return() {
            throw new Error("return failed");
          },
        }),
        {
          onClosed: () => {
            throw new Error("onClosed failed");
          },
        }
      );

      const iterator = stream[Symbol.asyncIterator]();
      await iterator.next();
      try {
        await iterator.return?.();
        expect.unreachable("expected AggregateError");
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        const aggregate = error as AggregateError;
        expect(aggregate.errors).toEqual([
          expect.objectContaining({ message: "return failed" }),
          expect.objectContaining({ message: "onClosed failed" }),
        ]);
      }
      expect(stream.phase).toBe("closed");
    });

    it("start failure does not leave the stream active", async () => {
      const onStarted = vi.fn();
      const onClosed = vi.fn();
      const stream = createManagedAsyncIterable(
        async () => {
          throw new Error("materialize failed");
        },
        { onStarted, onClosed }
      );

      const iterator = stream[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(/materialize failed/);
      expect(onStarted).not.toHaveBeenCalled();
      expect(onClosed).toHaveBeenCalledOnce();
      expect(stream.phase).toBe("closed");
    });
  });

  describe("races", () => {
    it("dispose during start still runs source return when start wins the race", async () => {
      let continueStart!: () => void;
      const gate = new Promise<void>((resolve) => {
        continueStart = resolve;
      });
      let returned = false;

      const stream = createManagedAsyncIterable(async () => {
        await gate;
        return {
          async next() {
            return { done: false as const, value: 1 };
          },
          async return() {
            returned = true;
            return { done: true as const, value: undefined };
          },
        };
      });

      const iterator = stream[Symbol.asyncIterator]();
      const nextPromise = iterator.next();
      await vi.waitFor(() => expect(stream.phase).toBe("starting"));

      const disposePromise = stream[Symbol.asyncDispose]();
      continueStart();

      await expect(nextPromise).resolves.toMatchObject({ done: true });
      await disposePromise;
      expect(returned).toBe(true);
      expect(stream.phase).toBe("closed");
    });

    it("onClosed runs at most once across completion and dispose", async () => {
      const onClosed = vi.fn();
      const stream = createManagedAsyncIterable(
        async function* () {
          yield 1;
        },
        { onClosed }
      );

      for await (const _ of stream) {
        /* drain */
      }
      await stream[Symbol.asyncDispose]();

      expect(onClosed).toHaveBeenCalledOnce();
    });
  });
});
