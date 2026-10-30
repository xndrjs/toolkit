import type { Disposable, Lifetime } from "../provider/provider.js";

type ScopePhase = "open" | "disposing" | "disposed";

/**
 * AbortController owned by a scope. `signal` also reflects an optional host
 * signal (via `AbortSignal.any`); `abort()` runs when the scope enters disposing.
 */
export type ScopeAbort = {
  readonly signal: AbortSignal;
  abort(): void;
};

export function createScopeAbort(hostSignal?: AbortSignal): ScopeAbort {
  const controller = new AbortController();
  const signal =
    hostSignal === undefined ? controller.signal : AbortSignal.any([controller.signal, hostSignal]);
  return {
    signal,
    abort(): void {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    },
  };
}

/**
 * Shared dispose state machine for ProviderScope, ExecutionLifecycle, and similar
 * owners. `enter`/`leave` bracket accepted work so dispose can drain before
 * sealing Lifetime buckets and running cleanups.
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

/**
 * Lifetime for one provider materialization attempt.
 * Cleanups land in a local bucket until {@link MaterializationLifetime.commit}
 * (success) or {@link MaterializationLifetime.rollback} (failure / abandoned).
 * Registration seals after either outcome — and also when the owning scope seals.
 */
export type MaterializationLifetime = {
  readonly lifetime: Lifetime;
  /** Seal registration and append local cleanups onto the owner bucket (LIFO later). */
  commit(ownerBucket: Disposable[]): void;
  /** Seal registration and run local cleanups immediately (failed / abandoned setup). */
  rollback(): Promise<void>;
};

export type MaterializationLifetimeOptions = {
  readonly signal: AbortSignal;
};

export function createMaterializationLifetime(
  scope: ScopeLifecycle,
  options: MaterializationLifetimeOptions
): MaterializationLifetime {
  const local: Disposable[] = [];
  let registrationSealed = false;

  function assertRegistrationOpen(): void {
    if (registrationSealed || scope.sealed) {
      throw new Error("Lifetime is sealed");
    }
  }

  const lifetime: Lifetime = {
    signal: options.signal,
    onDispose(cleanup: Disposable) {
      assertRegistrationOpen();
      local.push(cleanup);
    },
  };

  return {
    lifetime,
    commit(ownerBucket: Disposable[]) {
      registrationSealed = true;
      if (local.length > 0) {
        ownerBucket.push(...local.splice(0, local.length));
      }
    },
    async rollback() {
      registrationSealed = true;
      await runDisposers(local);
    },
  };
}

/**
 * Factory failed (or materialization abandoned): run local rollback; if rollback
 * also fails → `SuppressedError(rollbackError, factoryError)`.
 */
export async function throwAfterFactoryAndRollback(
  factoryError: unknown,
  rollback: () => Promise<void>
): Promise<never> {
  let rollbackError: unknown | undefined;
  try {
    await rollback();
  } catch (error) {
    rollbackError = error;
  }
  if (rollbackError !== undefined) {
    throw new SuppressedError(rollbackError, factoryError);
  }
  throw factoryError;
}

/** LIFO disposer drain; all cleanups are attempted before aggregating failures. */
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
