import { type AnyProvider, type WiringEntry, partitionWiring } from "../alias-intent.js";
import { intentIdentity, type Boundary } from "../boundary.js";
import {
  assertAcyclicPlan,
  assertClosedGraph,
  buildExecutionPlan,
  type ProviderLifetimePlan,
  resolveProviderLifetimes,
} from "../graph-plan.js";
import { intentIdentityFromMapKey } from "../intent-keys.js";
import { assertRegistrationSafety, buildRegistry } from "../registration.js";
import { assertStringRecordKeys } from "../string-keys.js";
import type { CompositionPlanDescription, EntryBoundaries } from "./composition-contract.js";

export type {
  CompositionPlanDescription,
  ProviderLifetimeDescription,
} from "./composition-contract.js";

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
  Entries extends EntryBoundaries,
  Surface extends Record<string, AnyProvider>,
  Wiring extends readonly WiringEntry[],
> = {
  readonly entryBoundaries: Entries;
  readonly surface: Surface;
  readonly wiring?: Wiring;
};

function assertEntryBoundaries(
  entryBoundaries: readonly Boundary<string>[],
  surfaceEntries: readonly (readonly [string, AnyProvider])[]
): readonly string[] {
  if (!Array.isArray(entryBoundaries) || entryBoundaries.length === 0) {
    throw new Error("Composition requires at least one Entry Boundary");
  }

  const entryIds = new Set<string>();
  for (const entry of entryBoundaries) {
    if (entry === null || typeof entry !== "object" || typeof entry.id !== "string") {
      throw new Error("Entry Boundaries must be Boundary values created by boundary()");
    }
    if (entryIds.has(entry.id)) {
      throw new Error(`Entry Boundary "${entry.id}" is declared more than once`);
    }
    entryIds.add(entry.id);
  }

  const represented = new Set<string>();
  for (const [alias, provider] of surfaceEntries) {
    if (provider.origin.kind === "adapter") {
      throw new Error(
        `Surface alias "${alias}" uses Adapter-originated Provider "${provider.origin.id}". ` +
          "Adapter Providers cannot be Composition roots."
      );
    }
    if (!entryIds.has(provider.origin.id)) {
      throw new Error(
        `Surface alias "${alias}" starts from Boundary "${provider.origin.id}", ` +
          `which is not a declared Entry Boundary. Declared: ${[...entryIds].join(", ")}`
      );
    }
    represented.add(provider.origin.id);
  }

  const unused = [...entryIds].filter((id) => !represented.has(id));
  if (unused.length > 0) {
    throw new Error(`Entry Boundary id(s) not represented in Surface: ${unused.join(", ")}`);
  }

  return [...entryIds];
}

/**
 * Register surface + wiring, build the execution plan, reject cycles / open graphs,
 * derive effective lifetimes, and freeze the plan description for {@link CompositionRoot.describePlan}.
 */
export function compileComposition<
  const Entries extends EntryBoundaries,
  Surface extends Record<string, AnyProvider>,
  const Wiring extends readonly WiringEntry[] = [],
>(options: CompileCompositionInput<Entries, Surface, Wiring>): CompiledComposition<Surface> {
  assertStringRecordKeys(options.surface, "Surface", { rejectReservedSurface: true });
  const surfaceEntries = Object.entries(options.surface) as [keyof Surface & string, AnyProvider][];
  const entryBoundaryIds = assertEntryBoundaries(options.entryBoundaries, surfaceEntries);
  const { providers: privateProviders, aliases } = partitionWiring(options.wiring ?? []);
  const surfaceProviders = surfaceEntries.map(([, p]) => p);

  assertRegistrationSafety(surfaceProviders, privateProviders, aliases);
  const { registry, aliasMap } = buildRegistry(surfaceProviders, privateProviders, aliases);

  const executionPlan = buildExecutionPlan(registry, aliases);
  assertAcyclicPlan(executionPlan);
  assertClosedGraph(registry, aliases);
  const lifetimePlan = resolveProviderLifetimes(executionPlan, registry);
  const planDescription: CompositionPlanDescription = Object.freeze({
    entryBoundaries: Object.freeze(entryBoundaryIds),
    surface: Object.freeze(
      surfaceEntries.map(([alias, provider]) =>
        Object.freeze({
          alias,
          intent: Object.freeze(intentIdentity(provider.intent)),
          origin: Object.freeze({ ...provider.origin }),
        })
      )
    ),
    providers: Object.freeze(
      [...registry].map(([key, provider]) => {
        const lifetime = lifetimePlan.get(key)!;
        return Object.freeze({
          intent: Object.freeze(intentIdentity(provider.intent)),
          mode: provider.intent.modality,
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
