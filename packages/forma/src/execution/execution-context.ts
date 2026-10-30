import type { AnyIntent, AnyProvider } from "../alias-intent.js";
import type {
  ExecutionContext,
  ExecutionContextArgs,
  ExecutionSurface,
} from "../composition/composition-contract.js";
import type { ProviderLifetimePlan } from "../graph-plan.js";
import { intentLabel, intentMapKey } from "../intent-keys.js";
import type { IntentOperation, ResolvedDeps, StreamOperation } from "../provider/provider.js";
import { createScopeAbort, throwAfterCallbackAndCleanup } from "./disposal.js";
import { createExecutionLifecycle } from "./execution-lifecycle.js";
import { createProviderScope, type ProviderScope } from "./provider-scope.js";
import { asyncIteratorOf, createStreamRegistry } from "./stream-registry.js";

type Awaitable<T> = T | PromiseLike<T>;
type Op = IntentOperation<unknown, unknown, unknown> | StreamOperation<unknown, unknown, unknown>;

function normalizeParams<Params>(params: Params): Readonly<Params> {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new TypeError("Execution params must be a plain object");
  }

  const prototype = Object.getPrototypeOf(params);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Execution params must be a plain object with Object or null prototype");
  }

  const normalized: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(params)) {
    if (typeof key !== "string") {
      throw new TypeError("Execution params keys must be strings");
    }
    if (key === "__proto__") {
      throw new TypeError('Execution params key "__proto__" is not allowed');
    }
    const descriptor = Object.getOwnPropertyDescriptor(params, key);
    if (!descriptor?.enumerable) {
      throw new TypeError(`Execution params property "${key}" must be enumerable`);
    }
    if (!("value" in descriptor)) {
      throw new TypeError(`Execution params property "${key}" must be a data property`);
    }
    normalized[key] = descriptor.value;
  }
  return Object.freeze(normalized) as Readonly<Params>;
}

/** Shared composition-owned state used by every open context. */
export type CompositionOwnedState = {
  readonly registry: ReadonlyMap<string, AnyProvider>;
  readonly aliasMap: ReadonlyMap<string, string>;
  readonly lifetimePlan: ProviderLifetimePlan;
  readonly surfaceEntries: readonly (readonly [string, AnyProvider])[];
  /** Scope for composition-effective providers. */
  readonly compositionScope: ProviderScope;
  readonly openContexts: Set<{ dispose(): Promise<void> }>;
};

/**
 * Open an owned execution context against a live composition root.
 * Caller must `dispose` / `await using`. Prefer {@link runWithExecutionContext}
 * for short lexical scopes.
 */
export function openExecutionContext<Surface extends Record<string, AnyProvider>, Params = void>(
  owned: CompositionOwnedState,
  ...args: ExecutionContextArgs<Params>
): ExecutionContext<Surface, Params> {
  owned.compositionScope.assertOpen();

  const openOptions = (args[0] ?? {}) as {
    readonly params?: Params;
    readonly signal?: AbortSignal;
  };
  openOptions.signal?.throwIfAborted();
  const contextParams = (
    "params" in openOptions && openOptions.params !== undefined
      ? normalizeParams(openOptions.params)
      : undefined
  ) as [Params] extends [void] ? undefined : Readonly<Params>;

  // One abort for the context: public `execution.signal` and Provider Lifetime.signal.
  const abort = createScopeAbort(openOptions.signal);

  /** Invocation leases (unary + stream registry) — not Provider materialization. */
  const execution = createExecutionLifecycle({
    notOpenMessage: "Execution context is disposed",
    abort,
  });

  /** Context-effective providers — materialize/cache/Lifetime only. */
  const contextScope = createProviderScope({
    notOpenMessage: "Execution context is disposed",
    abort,
  });

  const streams = createStreamRegistry({ parentSignal: execution.signal });

  const contextHandle = {
    dispose(): Promise<void> {
      // Kick stream close via context abort (inside execution.dispose) + closeAll;
      // unary/stream leases drain before ProviderScope dispose.
      return execution.dispose(async () => {
        await contextScope.dispose({
          beforeDisposers: () => streams.closeAll(),
          after: () => {
            owned.openContexts.delete(contextHandle);
          },
        });
      });
    },
  };
  owned.openContexts.add(contextHandle);

  /**
   * @param seeing - Intent identity keys already being materialized on this
   *   resolution chain (defense-in-depth; cycles are rejected at compose).
   * @param path - Display labels for the same chain (error diagnostics).
   */
  async function materialize(
    provider: AnyProvider,
    seeing: ReadonlySet<string> = new Set(),
    path: readonly string[] = []
  ): Promise<Op> {
    const id = intentMapKey(provider.intent);
    const label = intentLabel(provider.intent);
    const lifetime = owned.lifetimePlan.get(id);
    if (!lifetime) {
      throw new Error(`Internal error: missing lifetime resolution for ${label}`);
    }

    // lifetimePlan → pick scope (no parallel map selection).
    const scope = lifetime.effective === "context" ? contextScope : owned.compositionScope;

    return scope.getOrMaterialize(provider, {
      id,
      label,
      seeing,
      path,
      declaredPerContext: provider.lifetimePolicy === "context",
      contextParams,
      // Accepted work may continue after a host abort, but context-owned setup
      // must still roll back once explicit context disposal has started.
      assertAcceptingWork:
        lifetime.effective === "context" ? () => execution.assertOpen() : undefined,
      resolveDeps,
    });
  }

  async function resolveByIdentity(
    required: AnyIntent,
    seeing: ReadonlySet<string>,
    path: readonly string[]
  ): Promise<Op> {
    const requiredId = intentMapKey(required);
    const satisfierId = owned.aliasMap.get(requiredId) ?? requiredId;
    const provider = owned.registry.get(satisfierId);
    if (!provider) {
      const viaAlias =
        satisfierId !== requiredId
          ? ` (aliased satisfier identity has no registered provider)`
          : "";
      throw new Error(
        `No provider registered for Intent ${intentLabel(required)}${viaAlias}. Add it to surface or wiring.`
      );
    }
    return materialize(provider, seeing, path);
  }

  async function resolveDeps(
    provider: AnyProvider,
    seeing: ReadonlySet<string>,
    path: readonly string[]
  ): Promise<ResolvedDeps<AnyProvider["deps"]>> {
    const deps = provider.deps as Record<string, AnyIntent>;
    const resolved: Record<string, Op> = {};
    for (const [key, intent] of Object.entries(deps)) {
      resolved[key] = await resolveByIdentity(intent, seeing, path);
    }
    return resolved as ResolvedDeps<AnyProvider["deps"]>;
  }

  const surface = Object.create(null) as Record<string, unknown>;
  for (const [alias, provider] of owned.surfaceEntries) {
    if (provider.intent.modality === "stream") {
      surface[alias] = (input: unknown) => {
        // Sync cold iterable: materialize / lease / register only on first next().
        let leased = false;
        return streams.openResult(
          async (signal) => {
            const op = (await materialize(provider)) as StreamOperation<unknown, unknown, unknown>;
            const iterable = op(input, { signal });
            return asyncIteratorOf(iterable);
          },
          {
            signal: execution.signal,
            onStartAccepted: () => {
              execution.enter();
              leased = true;
            },
            onClosed: () => {
              if (leased) {
                execution.leave();
              }
            },
          }
        );
      };
    } else {
      surface[alias] = async (input: unknown) => {
        // Lease on the execution lifecycle for the whole surface call (materialize + invoke).
        execution.enter();
        try {
          const op = (await materialize(provider)) as IntentOperation<unknown, unknown, unknown>;
          return await op(input);
        } finally {
          execution.leave();
        }
      };
    }
  }

  const dispose = (): Promise<void> => contextHandle.dispose();
  return {
    surface: surface as ExecutionSurface<Surface>,
    signal: execution.signal,
    params: contextParams,
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}

/**
 * Safe default for short scopes: open → run with a borrowed surface → dispose.
 * See error matrix: both failures → `SuppressedError(cleanup, callback)`.
 */
export async function runWithExecutionContext<
  Surface extends Record<string, AnyProvider>,
  Params,
  T,
>(
  owned: CompositionOwnedState,
  run: (surface: ExecutionSurface<Surface>) => Awaitable<T>,
  ...args: ExecutionContextArgs<Params>
): Promise<Awaited<T>> {
  const execution = openExecutionContext<Surface, Params>(owned, ...args);
  let callbackError: unknown | undefined;
  let result: Awaited<T> | undefined;
  try {
    result = await run(execution.surface);
  } catch (error) {
    callbackError = error;
  }

  let cleanupError: unknown | undefined;
  try {
    await execution.dispose();
  } catch (error) {
    cleanupError = error;
  }

  throwAfterCallbackAndCleanup(callbackError, cleanupError);
  return result as Awaited<T>;
}
