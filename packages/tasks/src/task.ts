/**
 * Decides whether to run another attempt after `error` on zero-based `attempt`.
 * Return a Promise for async backoff or side effects.
 */
export type RetryPredicate = (error: unknown, attempt: number) => boolean | PromiseLike<boolean>;

/**
 * Lazy async unit: the effect runs when the task is awaited or chained via `then` / `catch` / `finally`.
 * Use {@link Task.retry} to wrap with a retry loop (infrastructure-friendly).
 */
export interface Task<T> extends PromiseLike<T> {
  retry(shouldRetry: RetryPredicate): Task<T>;

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
    retry(shouldRetry: RetryPredicate): Task<T> {
      return task(async () => {
        let attempt = 0;
        for (;;) {
          try {
            return await run();
          } catch (error) {
            if (!(await shouldRetry(error, attempt))) throw error;
            attempt += 1;
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
