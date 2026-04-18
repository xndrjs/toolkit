/**
 * Decides whether to run another attempt after `error` on zero-based `attempt`.
 * Return a Promise for async backoff or side effects.
 */
export type RetryPredicate = (error: unknown, attempt: number) => boolean | PromiseLike<boolean>;

/** Total times the effect may run (first try included). Default: {@link DEFAULT_MAX_ATTEMPTS}. */
export interface RetryOptions {
  maxAttempts?: number;
}

export const DEFAULT_MAX_ATTEMPTS = 3;

function assertMaxAttempts(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`maxAttempts must be an integer >= 1, got ${String(value)}`);
  }
  return value;
}

function resolveMaxAttempts(options?: RetryOptions): number {
  return assertMaxAttempts(options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
}

/**
 * Lazy async unit: the effect runs when the task is awaited or chained via `then` / `catch` / `finally`.
 * Use {@link Task.retry} to wrap with a retry loop (infrastructure-friendly).
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

export function task<T>(effect: () => Promise<T>): Task<T> {
  const run = effect;

  return {
    retry(shouldRetry: RetryPredicate, options?: RetryOptions): Task<T> {
      const maxAttempts = resolveMaxAttempts(options);

      return task(async () => {
        let invocations = 0;

        for (;;) {
          try {
            invocations += 1;
            return await run();
          } catch (error) {
            if (invocations >= maxAttempts) throw error;
            if (!(await shouldRetry(error, invocations - 1))) throw error;
          }
        }
      });
    },

    then(onfulfilled, onrejected) {
      return run().then(onfulfilled, onrejected);
    },

    catch(onrejected) {
      return run().catch(onrejected);
    },

    finally(onfinally) {
      return run().finally(onfinally);
    },
  };
}
