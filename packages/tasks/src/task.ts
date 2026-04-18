import type { RetryOptions, RetryPredicate, Task } from "./types";
import { resolveMaxAttempts } from "./utils";

export function task<T>(effect: () => Promise<T>): Task<T> {
  const run = effect;

  return {
    retry(shouldRetry: RetryPredicate, options?: RetryOptions): Task<T> {
      const maxAttempts = resolveMaxAttempts(options);

      return task(async () => {
        let invocations = 0;

        while (true) {
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
