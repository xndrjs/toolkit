/**
 * Decides whether to run another attempt after `error` on zero-based `attempt`.
 * Return a Promise for async backoff or side effects.
 */
export type RetryPredicate = (error: unknown, attempt: number) => boolean | PromiseLike<boolean>;

/** Total times the effect may run (first try included). Default: {@link DEFAULT_MAX_ATTEMPTS}. */
export interface RetryOptions {
  maxAttempts?: number;
}

/**
 * Lazy async unit: the effect runs when the task is awaited or chained via `then` / `catch` / `finally`.
 * Use {@link Task.retry} for resiliency policies.
 */
export interface Task<T> extends PromiseLike<T> {
  retry(shouldRetry: RetryPredicate, options?: RetryOptions): Task<T>;

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): Promise<TResult1 | TResult2>;

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null | undefined
  ): Promise<T | TResult>;

  finally(onfinally?: (() => void) | null | undefined): Promise<T>;
}
