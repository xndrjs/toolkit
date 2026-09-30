import type { Expansion, OnFailurePolicy, QueryDefinition, ResourceProjection } from "../ir";
import type { PayloadTypeLookup } from "./discriminants";

export type { PayloadTypeLookup };

/**
 * One arm of a resolve-to-each strip (resource + per-arm `on failure` for alias typing).
 */
export type ResolveEachArmStrip = {
  resource: string;
  onFailure: OnFailurePolicy;
};

/**
 * Resolve-only locator strip: unique settle-target resource names + multiplicity.
 * - `"one"`: 1→1 `resolve to { … }` → alias is a union of member projection types.
 * - `"many"`: `resolve to each …` → alias is an **array** of those member types
 *   (per-arm `onFailure` widen via {@link eachArms}).
 */
export type ResolveTargetInfo = {
  targets: string[];
  multiplicity: "one" | "many";
  /**
   * Per-arm strip for `resolve to each` (order + onFailure). `null` for 1→1
   * brace resolve.
   */
  eachArms: ResolveEachArmStrip[] | null;
};

/** resource → resolve strip info (1→1 arms or resolve-to-each). */
export type ResolveTargetIndex = Map<string, ResolveTargetInfo>;

/** Concrete members + outermost strip multiplicity from {@link stripToConcreteMembers}. */
export type ResolveStripResult = {
  members: string[];
  multiplicity: "one" | "many";
};

export function resolveTargetIndex(query: QueryDefinition): ResolveTargetIndex {
  const out: ResolveTargetIndex = new Map();
  for (const projection of query.projections) {
    if (projection.resolveArms !== null) {
      out.set(projection.resource, {
        targets: [...new Set(projection.resolveArms.map((arm) => arm.target.resource))],
        multiplicity: "one",
        eachArms: null,
      });
    } else if (projection.resolveEach !== null) {
      out.set(projection.resource, {
        targets: [...new Set(projection.resolveEach.arms.map((arm) => arm.target.resource))],
        multiplicity: "many",
        eachArms: projection.resolveEach.arms.map((arm) => ({
          resource: arm.target.resource,
          onFailure: arm.onFailure,
        })),
      });
    }
  }
  return out;
}

/** True when the query has at least one 1→1 resolve-only locator (redirect map). */
export function queryHasRedirectResolves(query: QueryDefinition): boolean {
  return [...resolveTargetIndex(query).values()].some((info) => info.multiplicity === "one");
}

/** Projections that emit a `projectOn*` shell / result type (excludes resolve-only). */
export function projectableProjections(query: QueryDefinition): ResourceProjection[] {
  return query.projections.filter((p) => p.resolveArms === null && p.resolveEach === null);
}

/** All expansions under a projection (flat body or flattened when-arms). */
export function allProjectionExpansions(projection: ResourceProjection): Expansion[] {
  if (projection.resolveArms !== null || projection.resolveEach !== null) {
    return [];
  }
  if (projection.arms !== null) {
    return projection.arms.flatMap((arm) => arm.expansions);
  }
  return projection.expansions;
}

/** Every per-edge `on failure` policy in a query. */
export function allOnFailurePolicies(query: QueryDefinition): OnFailurePolicy[] {
  const policies: OnFailurePolicy[] = [];
  for (const projection of query.projections) {
    if (projection.resolveEach !== null) {
      for (const arm of projection.resolveEach.arms) {
        policies.push(arm.onFailure);
      }
    }
    for (const expansion of allProjectionExpansions(projection)) {
      if (expansion.multiplicity === "one") {
        policies.push(expansion.onFailure);
        continue;
      }
      if (expansion.comprehension === null) continue;
      for (const arm of expansion.comprehension.arms) {
        policies.push(arm.onFailure);
      }
    }
  }
  return policies;
}

/** True when any expand uses `on failure set null` or `set error` (projectors need `failures`). */
export function queryNeedsFailureProjection(query: QueryDefinition): boolean {
  return allOnFailurePolicies(query).some((p) => p !== "throw");
}

/** True when any expand uses `on failure set error` (types reference `ResolutionError`). */
export function queryUsesSetError(query: QueryDefinition): boolean {
  return allOnFailurePolicies(query).some((p) => p === "setError");
}

/**
 * Concrete projectable resource names when expanding a **resolve-only** locator
 * (`CustomReference resolve to Entry | Asset`, or `TabCollection resolve to each …`).
 * Does **not** strip resource-union payloads (`EditorialModule: Hero | Tabs`) —
 * those require an explicit `on EditorialModule` (indirection goes through
 * `resolve to`, like CustomReference).
 *
 * Returns `null` when `targetName` is already projectable, has no resolve strip,
 * or is not a resolve-only locator. Stops at resources that have an explicit
 * projectable projection.
 *
 * `multiplicity` is taken from the **outermost** resolve locator (`"many"` ⇒
 * strip alias type is an array of member projection types).
 */
export function stripToConcreteMembers(
  targetName: string,
  resources: PayloadTypeLookup,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex,
  seen = new Set<string>()
): ResolveStripResult | null {
  if (seen.has(targetName)) {
    return null;
  }
  seen.add(targetName);

  // Explicit projectable `on Target` (armed Entry, flat Asset, …) — do not strip.
  if (projected.has(targetName)) {
    return null;
  }

  const entry = resolveTargets.get(targetName);
  if (entry === undefined || entry.targets.length === 0) {
    return null;
  }

  const members: string[] = [];
  for (const ref of entry.targets) {
    const nested = stripToConcreteMembers(ref, resources, projected, resolveTargets, new Set(seen));
    if (nested === null) {
      members.push(ref);
    } else {
      members.push(...nested.members);
    }
  }
  return {
    members: [...new Set(members)],
    multiplicity: entry.multiplicity,
  };
}
