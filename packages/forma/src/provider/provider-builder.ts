import type { Intent } from "../boundary.js";
import { assertStringRecordKeys, sealedStringRecord } from "../string-keys.js";
import type {
  EmptyDeps,
  Lifetime,
  LifetimePolicy,
  ProviderOrigin,
  ResolvedDeps,
  WithContext,
} from "./provider.js";
import type { AdaptProvideApi, ProvideApi, WithFactory } from "./provider-builder.types.js";

/**
 * Shared fluent implementation. Callers pick the public builder type
 * (`ProviderBuilder` vs `AdaptProviderBuilder`); `using` constraints are type-only.
 * `using` is one-shot: a second call throws at runtime and is absent from the type.
 */
function createProviderBuilder<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
  Deps,
  Policy extends LifetimePolicy,
  Params,
>(
  intent: Intent<BoundaryId, Name, Input, Success, Err>,
  deps: Deps,
  lifetimePolicy: Policy,
  origin: ProviderOrigin
) {
  const hasDeps = Reflect.ownKeys(deps as object).length > 0;

  return {
    using(newDeps: object) {
      if (hasDeps) {
        throw new Error(
          "using() can only be called once; put all dependencies in a single using({ ... }) call"
        );
      }
      assertStringRecordKeys(newDeps, "Provider using()");
      return createProviderBuilder(intent, sealedStringRecord(newDeps), lifetimePolicy, origin);
    },
    perContext() {
      // Type param P is erased; runtime forwards the host bag into perContext
      // factories when present; types gate `ctx.params` via Params / $params.
      return createProviderBuilder(intent, deps, "context" as const, origin);
    },
    perComposition() {
      return createProviderBuilder(intent, deps, "composition" as const, origin);
    },
    with(factory: WithFactory<Input, Success, Err, Deps, Params>) {
      return {
        intent,
        deps,
        lifetimePolicy,
        origin,
        $params: undefined as Params | undefined,
        factory: (resolved: ResolvedDeps<Deps>, lifetime: Lifetime, params?: unknown) => {
          const base = hasDeps ? { deps: resolved, lifetime } : { lifetime };
          const ctx =
            lifetimePolicy === "context" && params !== undefined ? { ...base, params } : base;
          return factory(ctx as WithContext<Deps, Params>);
        },
      };
    },
  };
}

/** Start the provider builder for an Intent (`origin.kind: "boundary"`). */
export function createProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
>(
  intent: Intent<BoundaryId, Name, Input, Success, Err>
): ProvideApi<BoundaryId, Name, Input, Success, Err> {
  return createProviderBuilder(intent, {} as EmptyDeps, "auto" as const, {
    kind: "boundary",
    id: intent.boundaryId,
  }) as ProvideApi<BoundaryId, Name, Input, Success, Err>;
}

/**
 * Start the provider builder for an Adapter realization (`origin.kind: "adapter"`).
 * `using` accepts Intents from any boundary.
 */
export function createAdaptProvideApi<
  BoundaryId extends string,
  Name extends string,
  Input,
  Success,
  Err,
>(
  intent: Intent<BoundaryId, Name, Input, Success, Err>,
  adapterId: string
): AdaptProvideApi<BoundaryId, Name, Input, Success, Err> {
  return createProviderBuilder(intent, {} as EmptyDeps, "auto" as const, {
    kind: "adapter",
    id: adapterId,
  }) as AdaptProvideApi<BoundaryId, Name, Input, Success, Err>;
}
