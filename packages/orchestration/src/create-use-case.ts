import type { Anemic } from "@xndrjs/branded";
import { toAnemic } from "@xndrjs/branded";

/**
 * Wraps a use-case definition so callers outside the orchestration layer
 * always receive anemic data. Brands are removed at the boundary.
 */
export const createUseCase = <TDeps, TArgs extends unknown[], TResult>(
  definition: (deps: TDeps) => (...args: TArgs) => Promise<TResult> | TResult
) => {
  return (deps: TDeps) => {
    const execute = definition(deps);

    return async (...args: TArgs): Promise<Anemic<Awaited<TResult>>> => {
      const result = await execute(...args);
      return toAnemic(result);
    };
  };
};
