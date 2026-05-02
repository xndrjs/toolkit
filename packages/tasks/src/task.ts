import { getOrCreateInflight } from "./inflight-dedup";
import { defaultInflightRegistry, type InflightRegistry } from "./inflight-registry";
import type {
  RetryOptions,
  RetryPredicate,
  Task,
  TaskAfterRetry,
  TaskFinal,
  TaskPromise,
} from "./types";
import { resolveMaxAttempts } from "./utils";

function promiseLike<T>(run: () => Promise<T>): TaskPromise<T> {
  return {
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

function createFinalTask<T>(run: () => Promise<T>): TaskFinal<T> {
  return promiseLike(run);
}

function createAfterRetryTask<T>(run: () => Promise<T>): TaskAfterRetry<T> {
  return {
    ...promiseLike(run),
    inflightDedup(key: symbol, registry: InflightRegistry = defaultInflightRegistry): TaskFinal<T> {
      return createFinalTask(() => getOrCreateInflight(registry, key, run));
    },
  };
}

function createInitialTask<T>(run: () => Promise<T>): Task<T> {
  return {
    ...promiseLike(run),
    retry(shouldRetry: RetryPredicate, options?: RetryOptions): TaskAfterRetry<T> {
      const maxAttempts = resolveMaxAttempts(options);
      const retriedRun = async (): Promise<T> => {
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
      };
      return createAfterRetryTask(retriedRun);
    },
    inflightDedup(key: symbol, registry: InflightRegistry = defaultInflightRegistry): TaskFinal<T> {
      return createFinalTask(() => getOrCreateInflight(registry, key, run));
    },
  };
}

export function task<T>(effect: () => Promise<T>): Task<T> {
  return createInitialTask(effect);
}
