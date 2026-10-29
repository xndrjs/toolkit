import type { AnyProvider } from "../alias-intent.js";
import type { CompiledComposition } from "../composition/compile-composition.js";
import type {
  CompositionRoot,
  ExecutionContextArgs,
  ExecutionSurface,
} from "../composition/composition-contract.js";
import type { Disposable, IntentOperation } from "../provider.js";
import {
  collectThrown,
  createScopeAbort,
  createScopeLifecycle,
  runDisposers,
  throwIfDisposerErrors,
} from "../scope-lifecycle.js";
import {
  type CompositionOwnedState,
  openExecutionContext,
  runWithExecutionContext,
} from "./execution-context.js";

type Awaitable<T> = T | PromiseLike<T>;
type Op = IntentOperation<unknown, unknown, unknown>;

/**
 * Build a live {@link CompositionRoot} from a closed {@link CompiledComposition}.
 * Plan description is already frozen on `compiled`; this only owns runtime scopes.
 */
export function createCompositionRoot<Surface extends Record<string, AnyProvider>, Params = void>(
  compiled: CompiledComposition<Surface>
): CompositionRoot<Surface, Params> {
  const { registry, aliasMap, lifetimePlan, planDescription, surfaceEntries } = compiled;

  /** Providers whose effective lifetime is composition — owned by the root scope. */
  const compositionOps = new Map<string, Op>();
  const compositionInflight = new Map<string, Promise<Op>>();
  const compositionDisposers: Disposable[] = [];
  const rootLife = createScopeLifecycle("Composition root is disposed");
  const rootAbort = createScopeAbort();
  /** Open execution contexts; root dispose closes them as backstop. */
  const openContexts = new Set<{ dispose(): Promise<void> }>();

  const owned: CompositionOwnedState = {
    registry,
    aliasMap,
    lifetimePlan,
    surfaceEntries,
    compositionOps,
    compositionInflight,
    compositionDisposers,
    rootLife,
    rootAbort,
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
    rootAbort.abort();
    return rootLife.dispose(async () => {
      const errors: unknown[] = [];
      const contexts = [...openContexts];
      const contextResults = await Promise.allSettled(contexts.map((c) => c.dispose()));
      for (const result of contextResults) {
        if (result.status === "rejected") {
          collectThrown(result.reason, errors);
        }
      }
      try {
        await runDisposers(compositionDisposers);
      } catch (error) {
        collectThrown(error, errors);
      } finally {
        compositionOps.clear();
      }
      throwIfDisposerErrors(errors);
    });
  }

  return {
    describePlan: () => planDescription,
    openExecutionContext: open,
    createExecutionContext: open,
    withExecutionContext: withContext,
    dispose: disposeRoot,
    [Symbol.asyncDispose]: disposeRoot,
  };
}
