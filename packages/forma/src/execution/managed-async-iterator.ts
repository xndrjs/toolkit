/**
 * Managed AsyncIterable lifecycle for Stream Intent surface wrappers (ADR 0012).
 * Cold, single-consumer, terminal-outcome, disposal error matrix aligned with scope dispose.
 */
import { isTerminalOutcome, type InvocationOutcome } from "../invocation-outcome.js";
import { collectThrown, throwAfterCallbackAndCleanup, throwIfDisposerErrors } from "./disposal.js";

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
  /**
   * When set on an Outcome iterable, convert source `start` / `next` failures into a
   * terminal yield instead of rejecting `next()`. Not used for consumer `throw()`,
   * `onStartAccepted` failures, or cleanup/dispose (lifecycle matrix unchanged).
   * Return `undefined` to keep the exceptional channel (rethrow).
   */
  readonly resolveSourceFailure?: (
    cause: unknown,
    phase: "stream-start" | "stream-next"
  ) => unknown | undefined;
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
 * Same as {@link createManagedAsyncIterable}, but enforces terminal
 * {@link InvocationOutcome} kinds (`error` / `unexpected` / `cancelled`): after the first
 * terminal yield is delivered, the wrapper calls `return()` on the source so later yields
 * are not observable.
 */
export function createManagedResultIterable<Item, Err>(
  start: ManagedAsyncIterableStart<InvocationOutcome<Item, Err>>,
  options: ManagedAsyncIterableOptions = {}
): ManagedAsyncIterable<InvocationOutcome<Item, Err>> {
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
        const early = await beginStart();
        if (early !== undefined) {
          return early;
        }
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
        const totalized = resolveTotalizedFailure(iterationError, "stream-next");
        if (totalized !== undefined) {
          return await deliverTerminalOutcome(totalized);
        }
        beginClose("throw");
        return await settleCloseWithIterationError(iterationError);
      }

      if (result.done) {
        beginClose("complete");
        await settleCloseOnly();
        return { done: true, value: result.value };
      }

      if (terminalErr && isTerminalOutcome(result.value)) {
        return await deliverTerminalOutcome(result.value);
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

  /**
   * @returns a terminal IteratorResult when start failed but was totalized into an
   * Outcome yield; `undefined` when start succeeded or the stream closed without a yield.
   */
  async function beginStart(): Promise<IteratorResult<T> | undefined> {
    if (phase !== "idle") {
      return undefined;
    }

    if (options.signal?.aborted) {
      const close = beginClose("abort");
      // A parent-aborted cold stream owns no resources, but still mark the
      // internally-created close promise handled.
      void close.catch(() => undefined);
      await close;
      return undefined;
    }

    phase = "starting";
    startAttempted = true;
    controller = new AbortController();

    try {
      // Acceptance is part of the start transaction. If it fails, do not run
      // the source; close releases any registry/lease work performed before throw.
      options.onStartAccepted?.();
    } catch (acceptanceError) {
      beginClose("throw");
      return await settleCloseWithIterationError(acceptanceError);
    }

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
    // startPromise exists before parent wiring so an abort racing with start
    // always waits for a produced iterator and can invoke return() exactly once.
    wireParentAbort();

    try {
      await startPromise;
      return undefined;
    } catch (startError) {
      const totalized = resolveTotalizedFailure(startError, "stream-start");
      if (totalized !== undefined) {
        return await deliverTerminalOutcome(totalized);
      }
      beginClose("throw");
      return await settleCloseWithIterationError(startError);
    }
  }

  function resolveTotalizedFailure(
    cause: unknown,
    phaseName: "stream-start" | "stream-next"
  ): T | undefined {
    if (!terminalErr || options.resolveSourceFailure === undefined) {
      return undefined;
    }
    return options.resolveSourceFailure(cause, phaseName) as T | undefined;
  }

  async function deliverTerminalOutcome(value: T): Promise<IteratorResult<T>> {
    beginClose("err-terminal");
    await settleCloseOnly();
    return { done: false, value };
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

function isTerminalPhase(phase: ManagedAsyncIteratorPhase): phase is "closing" | "closed" {
  return phase === "closing" || phase === "closed";
}
