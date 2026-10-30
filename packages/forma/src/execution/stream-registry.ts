import type { Result } from "../result.js";
import { collectThrown, throwIfDisposerErrors } from "./disposal.js";
import {
  createManagedResultIterable,
  type ManagedAsyncIterable,
  type ManagedAsyncIterableOptions,
  type ManagedAsyncIterableStart,
} from "./managed-async-iterator.js";

export type StreamRegistryOpenOptions = Omit<
  ManagedAsyncIterableOptions,
  "signal" | "onOwnerClose"
> & {
  /** Parent signal (defaults to the registry parent). */
  readonly signal?: AbortSignal;
};

/**
 * Deep module: active stream invocations owned by one execution context.
 * Hides managed-iterator bookkeeping; surface wrappers call {@link openResult}.
 */
export type StreamRegistry = {
  /**
   * Cold Result iterable: first `next()` transactionally registers the accepted start,
   * then runs `start`; tracked until close for {@link closeAll}.
   */
  openResult<Item, Err>(
    start: ManagedAsyncIterableStart<Result<Item, Err>>,
    options?: StreamRegistryOpenOptions
  ): ManagedAsyncIterable<Result<Item, Err>>;
  /** Abort + dispose every accepted stream (including `starting`; idempotent per stream). */
  closeAll(): Promise<void>;
};

export type CreateStreamRegistryOptions = {
  /** Execution-context signal; abort closes active streams (abort ≠ context dispose). */
  readonly parentSignal: AbortSignal;
};

export function createStreamRegistry(options: CreateStreamRegistryOptions): StreamRegistry {
  const active = new Set<ManagedAsyncIterable<Result<unknown, unknown>>>();
  const ownerCloses = new Set<PromiseLike<void>>();

  function trackOwnerClose(close: PromiseLike<void>): void {
    ownerCloses.add(close);
    void close.then(
      () => {
        ownerCloses.delete(close);
      },
      () => {
        // Retain failed owner closes until closeAll() observes them.
      }
    );
  }

  return {
    openResult<Item, Err>(
      start: ManagedAsyncIterableStart<Result<Item, Err>>,
      openOptions: StreamRegistryOpenOptions = {}
    ): ManagedAsyncIterable<Result<Item, Err>> {
      const managed = createManagedResultIterable(start, {
        signal: openOptions.signal ?? options.parentSignal,
        onStartAccepted: () => {
          active.add(managed as ManagedAsyncIterable<Result<unknown, unknown>>);
          openOptions.onStartAccepted?.();
        },
        onStarted: () => {
          openOptions.onStarted?.();
        },
        onClosed: async () => {
          active.delete(managed as ManagedAsyncIterable<Result<unknown, unknown>>);
          await openOptions.onClosed?.();
        },
        onOwnerClose: trackOwnerClose,
      });
      return managed;
    },

    async closeAll(): Promise<void> {
      const pending = new Set(ownerCloses);
      for (const stream of active) {
        pending.add(stream[Symbol.asyncDispose]());
      }

      const results = await Promise.allSettled(pending);
      const errors: unknown[] = [];
      let index = 0;
      for (const close of pending) {
        ownerCloses.delete(close);
        const result = results[index];
        index += 1;
        if (result?.status === "rejected") {
          collectThrown(result.reason, errors);
        }
      }
      throwIfDisposerErrors(errors);
    },
  };
}

/** Obtain an AsyncIterator from any AsyncIterable (generators are both). */
export function asyncIteratorOf<T>(iterable: AsyncIterable<T>): AsyncIterator<T> {
  return iterable[Symbol.asyncIterator]();
}
