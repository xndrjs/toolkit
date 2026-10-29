import type { Disposable, Lifetime } from "./provider.js";

type ScopePhase = "open" | "disposing" | "disposed";

/**
 * Shared dispose state machine for composition root and execution contexts.
 * `enter`/`leave` bracket accepted work so dispose can drain before sealing
 * Lifetime buckets and running cleanups.
 */
export function createScopeLifecycle(notOpenMessage: string) {
  let phase: ScopePhase = "open";
  let active = 0;
  let disposePromise: Promise<void> | undefined;
  let sealed = false;
  const idleWaiters: (() => void)[] = [];

  function notifyIdle(): void {
    if (active === 0) {
      while (idleWaiters.length > 0) {
        idleWaiters.shift()!();
      }
    }
  }

  return {
    get phase(): ScopePhase {
      return phase;
    },
    get sealed(): boolean {
      return sealed;
    },
    assertOpen(): void {
      if (phase !== "open") {
        throw new Error(notOpenMessage);
      }
    },
    /** Synchronously claim a slot; throws if not `open`. */
    enter(): void {
      if (phase !== "open") {
        throw new Error(notOpenMessage);
      }
      active += 1;
    },
    leave(): void {
      active -= 1;
      notifyIdle();
    },
    /**
     * Transition to `disposing` once; wait for `enter` slots to drain; seal;
     * run `cleanup`; always end in `disposed`. Concurrent callers share the
     * same promise (including rejection).
     */
    dispose(cleanup: () => Promise<void>): Promise<void> {
      if (disposePromise) {
        return disposePromise;
      }
      phase = "disposing";
      disposePromise = (async () => {
        if (active > 0) {
          await new Promise<void>((resolve) => {
            idleWaiters.push(resolve);
          });
        }
        sealed = true;
        try {
          await cleanup();
        } finally {
          phase = "disposed";
        }
      })();
      return disposePromise;
    },
  };
}

export type ScopeLifecycle = ReturnType<typeof createScopeLifecycle>;

export function createLifetime(bucket: Disposable[], scope: ScopeLifecycle): Lifetime {
  return {
    onDispose(cleanup: Disposable) {
      if (scope.sealed) {
        throw new Error("Lifetime is sealed");
      }
      bucket.push(cleanup);
    },
  };
}

export async function runDisposers(bucket: Disposable[]): Promise<void> {
  const cleanups = bucket.splice(0, bucket.length);
  const errors: unknown[] = [];
  for (let i = cleanups.length - 1; i >= 0; i -= 1) {
    try {
      await cleanups[i]!();
    } catch (error) {
      errors.push(error);
    }
  }
  throwIfDisposerErrors(errors);
}

export function throwIfDisposerErrors(errors: unknown[]): void {
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "One or more disposers failed");
  }
}

export function collectThrown(error: unknown, into: unknown[]): void {
  if (error instanceof AggregateError) {
    into.push(...error.errors);
  } else {
    into.push(error);
  }
}

/**
 * Error matrix for `withExecutionContext` / single-handle `await using`:
 * both callback and cleanup failed → `SuppressedError(cleanupError, callbackError)`.
 */
export function throwAfterCallbackAndCleanup(
  callbackError: unknown | undefined,
  cleanupError: unknown | undefined
): void {
  if (callbackError !== undefined && cleanupError !== undefined) {
    throw new SuppressedError(cleanupError, callbackError);
  }
  if (callbackError !== undefined) {
    throw callbackError;
  }
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
}
