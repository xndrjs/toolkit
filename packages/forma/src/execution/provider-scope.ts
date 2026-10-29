import type { AnyProvider } from "../alias-intent.js";
import type { Disposable, IntentOperation, ResolvedDeps } from "../provider/provider.js";
import {
  createMaterializationLifetime,
  createScopeAbort,
  createScopeLifecycle,
  collectThrown,
  runDisposers,
  throwAfterFactoryAndRollback,
  throwIfDisposerErrors,
} from "./disposal.js";

type Op = IntentOperation<unknown, unknown, unknown>;

export type GetOrMaterializeOptions = {
  readonly id: string;
  readonly label: string;
  readonly seeing: ReadonlySet<string>;
  readonly path: readonly string[];
  /** When true, factory receives execution `params`; otherwise `undefined`. */
  readonly declaredPerContext: boolean;
  readonly contextParams: unknown;
  resolveDeps(
    provider: AnyProvider,
    seeing: ReadonlySet<string>,
    path: readonly string[]
  ): Promise<ResolvedDeps<AnyProvider["deps"]>>;
};

export type ProviderScopeDisposeHooks = {
  /**
   * Runs after abort + drain + seal, before LIFO disposers.
   * Thrown errors are collected with disposer failures.
   */
  readonly beforeDisposers?: () => Promise<void>;
  /** Always runs after disposers attempt (alongside ops cache clear). */
  readonly after?: () => void;
};

/**
 * Deep module: one ownership scope for provider instances.
 * Owns lifecycle, abort signal, ops cache, inflight coalescing, disposer bucket,
 * materialization (commit/rollback), and terminal dispose.
 *
 * Composition root and each execution context each hold one {@link ProviderScope};
 * `lifetimePlan → pick scope` replaces selecting parallel maps by hand.
 */
export type ProviderScope = {
  readonly signal: AbortSignal;
  assertOpen(): void;
  /** Synchronously claim a slot; throws if not open. */
  enter(): void;
  leave(): void;
  /**
   * Cache hit, inflight coalesce, or run factory once under this scope's Lifetime.
   * Concurrent first-access callers share one promise; failed attempts are not cached.
   */
  getOrMaterialize(provider: AnyProvider, options: GetOrMaterializeOptions): Promise<Op>;
  /**
   * Terminal dispose: abort → drain enter slots → seal → optional before hook →
   * LIFO disposers → clear cache.
   */
  dispose(hooks?: ProviderScopeDisposeHooks): Promise<void>;
};

export type CreateProviderScopeOptions = {
  readonly notOpenMessage: string;
  /** Optional host signal merged into this scope's AbortSignal (via `AbortSignal.any`). */
  readonly hostSignal?: AbortSignal;
};

export function createProviderScope(options: CreateProviderScopeOptions): ProviderScope {
  const life = createScopeLifecycle(options.notOpenMessage);
  const abort = createScopeAbort(options.hostSignal);
  const ops = new Map<string, Op>();
  const inflight = new Map<string, Promise<Op>>();
  const disposers: Disposable[] = [];

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
    getOrMaterialize(provider, opts): Promise<Op> {
      const { id, label, seeing, path, declaredPerContext, contextParams, resolveDeps } = opts;

      const cached = ops.get(id);
      if (cached) {
        return Promise.resolve(cached);
      }

      if (seeing.has(id)) {
        return Promise.reject(new Error(`Circular dependency: ${[...path, label].join(" -> ")}`));
      }

      const pending = inflight.get(id);
      if (pending) {
        return pending;
      }

      const nextSeeing = new Set(seeing);
      nextSeeing.add(id);
      const nextPath = [...path, label];

      life.enter();
      const promise = (async (): Promise<Op> => {
        const setup = createMaterializationLifetime(life, { signal: abort.signal });
        try {
          // Yield so concurrent first-access callers can join this inflight promise
          // before the factory runs (single materialization per lifetime).
          await Promise.resolve();
          life.assertOpen();
          const deps = await resolveDeps(provider, nextSeeing, nextPath);
          life.assertOpen();
          const produced = provider.factory(
            deps,
            setup.lifetime,
            declaredPerContext ? contextParams : undefined
          );
          const op = await produced;
          life.assertOpen();
          setup.commit(disposers);
          ops.set(id, op);
          return op;
        } catch (error) {
          // Failed or abandoned setup: rollback local cleanups; do not cache.
          return await throwAfterFactoryAndRollback(error, () => setup.rollback());
        } finally {
          inflight.delete(id);
          life.leave();
        }
      })();

      inflight.set(id, promise);
      return promise;
    },
    dispose(hooks?: ProviderScopeDisposeHooks): Promise<void> {
      abort.abort();
      return life.dispose(async () => {
        const errors: unknown[] = [];
        if (hooks?.beforeDisposers) {
          try {
            await hooks.beforeDisposers();
          } catch (error) {
            collectThrown(error, errors);
          }
        }
        try {
          await runDisposers(disposers);
        } catch (error) {
          collectThrown(error, errors);
        } finally {
          ops.clear();
          hooks?.after?.();
        }
        throwIfDisposerErrors(errors);
      });
    },
  };
}
