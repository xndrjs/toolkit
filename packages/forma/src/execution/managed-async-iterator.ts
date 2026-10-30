/**
 * Managed AsyncIterable lifecycle for Stream Intent surface wrappers (ADR 0012).
 * Cold, single-consumer, Err-terminal, disposal error matrix aligned with scope dispose.
 */
import { collectThrown, throwAfterCallbackAndCleanup, throwIfDisposerErrors } from "./disposal.js";
import type { Result } from "../result.js";

export type ManagedAsyncIteratorPhase = "idle" | "starting" | "active" | "closing" | "closed";

export type ManagedAsyncIterableOptions = {
  /**
   * Parent/host signal (e.g. execution-context signal). Abort closes this stream;
   * it does not imply dispose ownership of a larger scope.
   */
  readonly signal?: AbortSignal;
  /** Internal registry hook: the cold start has been accepted and must be tracked. */
  readonly onStartAccepted?: () => void;
  /** Invoked once after `start` succeeds and the stream enters `active`. */
  readonly onStarted?: () => void;
  /**
   * Invoked exactly once when the stream reaches `closed` (after inner cleanup).
   * Suitable for release-once of a lease / registry entry.
   */
  readonly onClosed?: () => void | Promise<void>;
  /** Internal owner hook for a close initiated by the parent signal. */
  readonly onOwnerClose?: (close: Promise<void>) => void;
};

export type ManagedAsyncIterableStart<T> = (
  signal: AbortSignal
) => AsyncIterator<T> | Promise<AsyncIterator<T>>;

export type ManagedAsyncIterable<T> = AsyncIterable<T> &
  AsyncDisposable & {
    readonly phase: ManagedAsyncIteratorPhase;
  };

type CloseReason = "complete" | "return" | "throw" | "err-terminal" | "abort" | "dispose";

/**
 * Cold, single-consumer `AsyncIterable` with `[Symbol.asyncDispose]`.
 * State machine: `idle → starting → active → closing → closed` (close may skip `active`
 * when disposed before start or when start fails).
 */
export function createManagedAsyncIterable<T>(
  start: ManagedAsyncIterableStart<T>,
  options: ManagedAsyncIterableOptions = {}
): ManagedAsyncIterable<T> {
  return createManaged(start, options, false);
}

/**
 * Same as {@link createManagedAsyncIterable}, but enforces `Result` `err` as terminal:
 * after the first `err` is delivered, the wrapper calls `return()` on the source so later
 * yields are not observable.
 */
export function createManagedResultIterable<Item, Err>(
  start: ManagedAsyncIterableStart<Result<Item, Err>>,
  options: ManagedAsyncIterableOptions = {}
): ManagedAsyncIterable<Result<Item, Err>> {
  return createManaged(start, options, true);
}

function createManaged<T>(
  start: ManagedAsyncIterableStart<T>,
  options: ManagedAsyncIterableOptions,
  terminalErr: boolean
): ManagedAsyncIterable<T> {
  let phase: ManagedAsyncIteratorPhase = "idle";
  let iteratorTaken = false;
  let nextInFlight = false;
  let startAttempted = false;

  let controller: AbortController | undefined;
  let removeParentAbort: (() => void) | undefined;
  let inner: AsyncIterator<T> | undefined;
  let startPromise: Promise<AsyncIterator<T>> | undefined;
  let closePromise: Promise<void> | undefined;

  const managed: ManagedAsyncIterable<T> = {
    get phase() {
      return phase;
    },

    [Symbol.asyncIterator](): AsyncIterator<T> {
      if (iteratorTaken) {
        throw new Error("ManagedAsyncIterable is single-consumer; already iterated");
      }
      iteratorTaken = true;
      return {
        next: () => next(),
        return: (value?: unknown) => returnIterator(value),
        throw: (error?: unknown) => throwIterator(error),
      };
    },

    [Symbol.asyncDispose](): Promise<void> {
      return beginClose("dispose");
    },
  };

  return managed;

  async function next(): Promise<IteratorResult<T>> {
    if (isTerminalPhase(phase)) {
      await settleCloseOnly();
      return doneResult();
    }

    if (nextInFlight) {
      throw new Error("ManagedAsyncIterable does not support concurrent next()");
    }
    nextInFlight = true;

    try {
      if (phase === "idle") {
        await beginStart();
      } else if (phase === "starting") {
        await startPromise;
      }

      // Phase may change across awaits (close race); re-read via helper.
      if (isTerminalPhase(phase) || inner === undefined || phase !== "active") {
        if (isTerminalPhase(phase)) {
          await settleCloseOnly();
          return doneResult();
        }
        throw new Error(`ManagedAsyncIterable.next() in unexpected phase: ${phase}`);
      }

      const source = inner;
      let result: IteratorResult<T>;
      try {
        result = await source.next();
      } catch (iterationError) {
        beginClose("throw");
        return await settleCloseWithIterationError(iterationError);
      }

      if (result.done) {
        beginClose("complete");
        await settleCloseOnly();
        return { done: true, value: result.value };
      }

      if (terminalErr && isResultErr(result.value)) {
        beginClose("err-terminal");
        await settleCloseOnly();
        return result;
      }

      return result;
    } finally {
      nextInFlight = false;
    }
  }

  async function returnIterator(value?: unknown): Promise<IteratorResult<T>> {
    beginClose("return");
    await settleCloseOnly();
    return { done: true, value: value as T };
  }

  async function throwIterator(error?: unknown): Promise<IteratorResult<T>> {
    const iterationError = error ?? new Error("ManagedAsyncIterable.throw()");
    beginClose("throw");
    return await settleCloseWithIterationError(iterationError);
  }

  function doneResult(): IteratorResult<T> {
    return { done: true, value: undefined as unknown as T };
  }

  async function beginStart(): Promise<void> {
    if (phase !== "idle") {
      return;
    }

    if (options.signal?.aborted) {
      const close = beginClose("abort");
      // A parent-aborted cold stream owns no resources, but still mark the
      // internally-created close promise handled.
      void close.catch(() => undefined);
      await close;
      return;
    }

    phase = "starting";
    startAttempted = true;
    controller = new AbortController();

    startPromise = Promise.resolve()
      .then(() => start(controller!.signal))
      .then((iterator) => {
        if (phase === "closing" || phase === "closed") {
          // Lost the race with close: still hand the iterator to close so return() runs.
          inner = iterator;
          return iterator;
        }
        inner = iterator;
        phase = "active";
        options.onStarted?.();
        return iterator;
      });
    options.onStartAccepted?.();
    wireParentAbort();

    try {
      await startPromise;
    } catch (startError) {
      beginClose("throw");
      return await settleCloseWithIterationError(startError);
    }
  }

  function wireParentAbort(): void {
    const parent = options.signal;
    if (parent === undefined) {
      return;
    }
    if (parent.aborted) {
      observeOwnerClose(beginClose("abort"));
      return;
    }
    const onAbort = (): void => {
      observeOwnerClose(beginClose("abort"));
    };
    parent.addEventListener("abort", onAbort, { once: true });
    removeParentAbort = () => {
      parent.removeEventListener("abort", onAbort);
    };
  }

  function observeOwnerClose(close: Promise<void>): void {
    options.onOwnerClose?.(close);
    // Parent abort is an event callback and cannot await. Keep the canonical
    // promise rejected for later observers while preventing unhandledRejection.
    void close.catch(() => undefined);
  }

  function beginClose(_reason: CloseReason): Promise<void> {
    if (closePromise !== undefined) {
      return closePromise;
    }

    if (phase === "closed") {
      closePromise = Promise.resolve();
      return closePromise;
    }

    phase = "closing";
    if (controller !== undefined && !controller.signal.aborted) {
      controller.abort();
    }
    removeParentAbort?.();
    removeParentAbort = undefined;

    closePromise = runClose();
    return closePromise;
  }

  async function runClose(): Promise<void> {
    const cleanupErrors: unknown[] = [];

    if (startPromise !== undefined) {
      try {
        await startPromise;
      } catch {
        // Start failure is surfaced by the starter; cleanup still proceeds.
      }
    }

    if (inner?.return !== undefined) {
      try {
        await inner.return();
      } catch (error) {
        collectThrown(error, cleanupErrors);
      }
    }

    // Release-once only if start was attempted (dispose-while-idle skips hooks).
    if (startAttempted && options.onClosed !== undefined) {
      try {
        await options.onClosed();
      } catch (error) {
        collectThrown(error, cleanupErrors);
      }
    }

    phase = "closed";
    throwIfDisposerErrors(cleanupErrors);
  }

  async function settleCloseOnly(): Promise<void> {
    if (closePromise === undefined) {
      return;
    }
    await closePromise;
  }

  async function settleCloseWithIterationError(iterationError: unknown): Promise<never> {
    let cleanupError: unknown | undefined;
    try {
      await settleCloseOnly();
    } catch (error) {
      cleanupError = error;
    }
    throwAfterCallbackAndCleanup(iterationError, cleanupError);
    // throwAfterCallbackAndCleanup always throws when iterationError is set.
    throw iterationError;
  }
}

function isResultErr(value: unknown): value is Result<never, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    (value as { ok: unknown }).ok === false
  );
}

function isTerminalPhase(phase: ManagedAsyncIteratorPhase): phase is "closing" | "closed" {
  return phase === "closing" || phase === "closed";
}
