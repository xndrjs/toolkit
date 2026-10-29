import { type AnyProvider, type WiringEntry, partitionWiring } from "../alias-intent.js";
import { intentIdentity, type IntentIdentity } from "../boundary.js";
import {
  assertAcyclicPlan,
  assertClosedGraph,
  buildExecutionPlan,
  type EffectiveLifetime,
  type ProviderLifetimePlan,
  resolveProviderLifetimes,
} from "../graph-plan.js";
import { intentIdentityFromMapKey } from "../intent-keys.js";
import type { LifetimePolicy } from "../provider.js";
import { assertRegistrationSafety, buildRegistry } from "../registration.js";
import { assertStringRecordKeys } from "../string-keys.js";

/** Read-only explanation of one Provider's declared and graph-derived lifetime. */
export type ProviderLifetimeDescription = {
  readonly intent: IntentIdentity;
  readonly declared: LifetimePolicy;
  readonly effective: EffectiveLifetime;
  /** Structured path from an `auto` Provider to the context-bound cause. */
  readonly narrowedBy?: readonly IntentIdentity[];
};

export type CompositionPlanDescription = {
  readonly providers: readonly ProviderLifetimeDescription[];
};

/**
 * Closed, validated composition graph ready for a composition root.
 * Built once by {@link compileComposition}; roots only materialize from this.
 */
export type CompiledComposition<
  Surface extends Record<string, AnyProvider> = Record<string, AnyProvider>,
> = {
  readonly registry: ReadonlyMap<string, AnyProvider>;
  readonly aliasMap: ReadonlyMap<string, string>;
  readonly lifetimePlan: ProviderLifetimePlan;
  readonly planDescription: CompositionPlanDescription;
  readonly surfaceEntries: readonly [keyof Surface & string, AnyProvider][];
};

type CompileCompositionInput<
  Surface extends Record<string, AnyProvider>,
  Wiring extends readonly WiringEntry[],
> = {
  readonly surface: Surface;
  readonly wiring?: Wiring;
};

/**
 * Register surface + wiring, build the execution plan, reject cycles / open graphs,
 * derive effective lifetimes, and freeze the plan description for {@link CompositionRoot.describePlan}.
 */
export function compileComposition<
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(options: CompileCompositionInput<Surface, Wiring>): CompiledComposition<Surface> {
  assertStringRecordKeys(options.surface, "Surface", { rejectReservedSurface: true });
  const surfaceEntries = Object.entries(options.surface) as [keyof Surface & string, AnyProvider][];
  const { providers: privateProviders, aliases } = partitionWiring(options.wiring ?? []);
  const surfaceProviders = surfaceEntries.map(([, p]) => p);

  assertRegistrationSafety(surfaceProviders, privateProviders, aliases);
  const { registry, aliasMap } = buildRegistry(surfaceProviders, privateProviders, aliases);

  const executionPlan = buildExecutionPlan(registry, aliases);
  assertAcyclicPlan(executionPlan);
  assertClosedGraph(registry, aliases);
  const lifetimePlan = resolveProviderLifetimes(executionPlan, registry);
  const planDescription: CompositionPlanDescription = Object.freeze({
    providers: Object.freeze(
      [...registry].map(([key, provider]) => {
        const lifetime = lifetimePlan.get(key)!;
        return Object.freeze({
          intent: Object.freeze(intentIdentity(provider.intent)),
          declared: lifetime.declared,
          effective: lifetime.effective,
          ...(lifetime.narrowedBy
            ? {
                narrowedBy: Object.freeze(lifetime.narrowedBy.map(intentIdentityFromMapKey)),
              }
            : {}),
        });
      })
    ),
  });

  return {
    registry,
    aliasMap,
    lifetimePlan,
    planDescription,
    surfaceEntries,
  };
}
