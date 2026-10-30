import type { Result } from "../result.js";
import {
  createManagedResultIterable,
  type ManagedAsyncIterable,
  type ManagedAsyncIterableOptions,
  type ManagedAsyncIterableStart,
} from "./managed-async-iterator.js";

export type StreamRegistryOpenOptions = Omit<ManagedAsyncIterableOptions, "signal"> & {
  /** Parent signal (defaults to the registry parent). */
  readonly signal?: AbortSignal;
};

/**
 * Deep module: active stream invocations owned by one execution context.
 * Hides managed-iterator bookkeeping; surface wrappers call {@link openResult}.
 */
export type StreamRegistry = {
  /**
   * Cold Result iterable: first `next()` runs `start`; tracks the stream while active
   * for {@link closeAll}.
   */
  openResult<Item, Err>(
    start: ManagedAsyncIterableStart<Result<Item, Err>>,
    options?: StreamRegistryOpenOptions
  ): ManagedAsyncIterable<Result<Item, Err>>;
  /** Abort + dispose every stream that reached `active` (idempotent per stream). */
  closeAll(): Promise<void>;
};

export type CreateStreamRegistryOptions = {
  /** Execution-context signal; abort closes active streams (abort ≠ context dispose). */
  readonly parentSignal: AbortSignal;
};

export function createStreamRegistry(options: CreateStreamRegistryOptions): StreamRegistry {
  const active = new Set<ManagedAsyncIterable<Result<unknown, unknown>>>();

  return {
    openResult<Item, Err>(
      start: ManagedAsyncIterableStart<Result<Item, Err>>,
      openOptions: StreamRegistryOpenOptions = {}
    ): ManagedAsyncIterable<Result<Item, Err>> {
      const managed = createManagedResultIterable(start, {
        signal: openOptions.signal ?? options.parentSignal,
        onStarted: () => {
          active.add(managed as ManagedAsyncIterable<Result<unknown, unknown>>);
          openOptions.onStarted?.();
        },
        onClosed: async () => {
          active.delete(managed as ManagedAsyncIterable<Result<unknown, unknown>>);
          await openOptions.onClosed?.();
        },
      });
      return managed;
    },

    async closeAll(): Promise<void> {
      const pending = [...active].map((stream) => stream[Symbol.asyncDispose]());
      await Promise.all(pending);
    },
  };
}

/** Obtain an AsyncIterator from any AsyncIterable (generators are both). */
export function asyncIteratorOf<T>(iterable: AsyncIterable<T>): AsyncIterator<T> {
  return iterable[Symbol.asyncIterator]();
}
