import type { AnyProvider } from "../alias-intent.js";
import type { CompiledComposition } from "../composition/compile-composition.js";
import type {
  CompositionRoot,
  ExecutionContextArgs,
  ExecutionSurface,
} from "../composition/composition-contract.js";
import { collectThrown, throwIfDisposerErrors } from "./disposal.js";
import {
  type CompositionOwnedState,
  openExecutionContext,
  runWithExecutionContext,
} from "./execution-context.js";
import { createProviderScope } from "./provider-scope.js";

type Awaitable<T> = T | PromiseLike<T>;

/**
 * Build a live {@link CompositionRoot} from a closed {@link CompiledComposition}.
 * Plan description is already frozen on `compiled`; this only owns runtime scopes.
 */
export function createCompositionRoot<Surface extends Record<string, AnyProvider>, Params = void>(
  compiled: CompiledComposition<Surface>
): CompositionRoot<Surface, Params> {
  const { registry, aliasMap, lifetimePlan, planDescription, surfaceEntries } = compiled;

  /** Composition-effective providers — owned by this scope. */
  const compositionScope = createProviderScope({
    notOpenMessage: "Composition root is disposed",
  });
  /** Open execution contexts; root dispose closes them as backstop. */
  const openContexts = new Set<{ dispose(): Promise<void> }>();

  const owned: CompositionOwnedState = {
    registry,
    aliasMap,
    lifetimePlan,
    surfaceEntries,
    compositionScope,
    openContexts,
  };

  function open(...args: ExecutionContextArgs<Params>) {
    return openExecutionContext<Surface, Params>(owned, ...args);
  }

  async function withContext<T>(
    run: (surface: ExecutionSurface<Surface>) => Awaitable<T>,
    ...args: ExecutionContextArgs<Params>
  ): Promise<Awaited<T>> {
    return runWithExecutionContext<Surface, Params, T>(owned, run, ...args);
  }

  function disposeRoot(): Promise<void> {
    return compositionScope.dispose({
      beforeDisposers: async () => {
        const contexts = [...openContexts];
        const contextResults = await Promise.allSettled(contexts.map((c) => c.dispose()));
        const errors: unknown[] = [];
        for (const result of contextResults) {
          if (result.status === "rejected") {
            collectThrown(result.reason, errors);
          }
        }
        throwIfDisposerErrors(errors);
      },
    });
  }

  return {
    describePlan: () => planDescription,
    openExecutionContext: open,
    withExecutionContext: withContext,
    dispose: disposeRoot,
    [Symbol.asyncDispose]: disposeRoot,
  };
}
