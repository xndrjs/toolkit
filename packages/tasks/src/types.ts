import type { InflightRegistry } from "./inflight-registry";

/**
 * Decides whether to run another attempt after `error` on zero-based `attempt`.
 * Return a Promise for async backoff or side effects.
 */
export type RetryPredicate = (error: unknown, attempt: number) => boolean | PromiseLike<boolean>;

/** Total times the effect may run (first try included). Default: {@link DEFAULT_MAX_ATTEMPTS}. */
export interface RetryOptions {
  maxAttempts?: number;
}

/** Promise-like surface: consumption via `await` or `.then` / `.catch` / `.finally`. */
export interface TaskPromise<T> extends PromiseLike<T> {
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null | undefined
  ): Promise<TResult1 | TResult2>;

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null | undefined
  ): Promise<T | TResult>;

  finally(onfinally?: (() => void) | null | undefined): Promise<T>;
}

/**
 * After `.retry()`: you may add **at most one** `.inflightDedup`, or use the task as a promise only.
 * Chaining a second `.retry` is not allowed.
 */
export interface TaskAfterRetry<T> extends TaskPromise<T> {
  inflightDedup(key: symbol, registry?: InflightRegistry): TaskFinal<T>;
}

/**
 * After `.inflightDedup()`: only promise chaining — no `.retry` and no second `.inflightDedup`.
 */
export type TaskFinal<T> = TaskPromise<T>;

/**
 * Result of {@link task}: choose **either** `.retry()` **or** `.inflightDedup()` (or neither), not both orders.
 * Allowed shapes: `task()`, `task().retry()`, `task().inflightDedup()`, `task().retry().inflightDedup()`.
 */
export interface Task<T> extends TaskPromise<T> {
  retry(shouldRetry: RetryPredicate, options?: RetryOptions): TaskAfterRetry<T>;

  /**
   * Coalesce concurrent consumers: same `key` in the same {@link InflightRegistry} shares one in-flight run
   * of this task’s effect. If you use `.retry()` as well, call `.inflightDedup` **after** `.retry`.
   * The slot clears when that run settles (success or final failure).
   *
   * Use a **fresh symbol** per logical operation (e.g. `const MY_OP = Symbol("MY_OP")`) to avoid accidental
   * sharing; use {@link Symbol.for} when you intentionally want cross-module agreement on the same slot.
   */
  inflightDedup(key: symbol, registry?: InflightRegistry): TaskFinal<T>;
}
