import type { AnyIntent, AnyProvider } from "../alias-intent.js";
import type {
  ExecutionContext,
  ExecutionContextArgs,
  ExecutionSurface,
} from "../composition/composition-contract.js";
import type { ProviderLifetimePlan } from "../graph-plan.js";
import { intentLabel, intentMapKey } from "../intent-keys.js";
import type { IntentOperation, ResolvedDeps } from "../provider.js";
import { throwAfterCallbackAndCleanup } from "./disposal.js";
import { createProviderScope, type ProviderScope } from "./provider-scope.js";

type Awaitable<T> = T | PromiseLike<T>;
type Op = IntentOperation<unknown, unknown, unknown>;

function freezeParams<Params>(params: Params): Readonly<Params> {
  if (Array.isArray(params)) {
    return Object.freeze([...params]) as unknown as Readonly<Params>;
  }
  if (params !== null && typeof params === "object") {
    return Object.freeze({ ...(params as object) }) as unknown as Readonly<Params>;
  }
  return params as Readonly<Params>;
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
  const contextParams = (
    "params" in openOptions && openOptions.params !== undefined
      ? freezeParams(openOptions.params)
      : undefined
  ) as [Params] extends [void] ? undefined : Readonly<Params>;

  /** Context-effective providers — owned by this scope. */
  const contextScope = createProviderScope({
    notOpenMessage: "Execution context is disposed",
    hostSignal: openOptions.signal,
  });

  const contextHandle = {
    dispose(): Promise<void> {
      return contextScope.dispose({
        after: () => {
          owned.openContexts.delete(contextHandle);
        },
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
    surface[alias] = async (input: unknown) => {
      // Lease on the execution context for the whole surface call (materialize + invoke).
      contextScope.enter();
      try {
        const op = await materialize(provider);
        return await op(input);
      } finally {
        contextScope.leave();
      }
    };
  }

  const dispose = (): Promise<void> => contextHandle.dispose();
  return {
    surface: surface as ExecutionSurface<Surface>,
    signal: contextScope.signal,
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
