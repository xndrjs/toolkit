import { createScopeAbort, createScopeLifecycle, type ScopeAbort } from "./disposal.js";

export type CreateExecutionLifecycleOptions = {
  readonly notOpenMessage: string;
  /**
   * Shared abort handle for this execution context (public `signal` + Provider
   * Lifetime). When omitted, one is created from `hostSignal`.
   */
  readonly abort?: ScopeAbort;
  /** Optional host signal merged into a newly created AbortSignal (ignored if `abort` is set). */
  readonly hostSignal?: AbortSignal;
};

/**
 * Deep module: execution-context invocation lifetime (unary surface leases today;
 * stream registry later). Distinct from {@link import("./provider-scope.js").ProviderScope},
 * which only materializes / caches / owns Provider Lifetime.
 *
 * Dispose: abort context signal → drain accepted invocations → run `afterDrain`
 * (typically dispose the context {@link import("./provider-scope.js").ProviderScope}).
 */
export type ExecutionLifecycle = {
  readonly signal: AbortSignal;
  assertOpen(): void;
  /** Synchronously claim a unary surface-call lease; throws if not open. */
  enter(): void;
  leave(): void;
  /**
   * Terminal dispose: abort → drain enter slots → `afterDrain`.
   * Concurrent callers share one promise; always ends disposed.
   */
  dispose(afterDrain: () => Promise<void>): Promise<void>;
};

export function createExecutionLifecycle(
  options: CreateExecutionLifecycleOptions
): ExecutionLifecycle {
  const life = createScopeLifecycle(options.notOpenMessage);
  const abort = options.abort ?? createScopeAbort(options.hostSignal);

  return {
    get signal(): AbortSignal {
      return abort.signal;
    },
    assertOpen(): void {
      life.assertOpen();
    },
    enter(): void {
      life.enter();
    },
    leave(): void {
      life.leave();
    },
    dispose(afterDrain: () => Promise<void>): Promise<void> {
      abort.abort();
      return life.dispose(afterDrain);
    },
  };
}
