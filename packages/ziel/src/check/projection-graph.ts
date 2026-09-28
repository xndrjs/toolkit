import type { Expansion, QueryDefinition, ResourceProjection, TypeExpr } from "../ir";
import type { PayloadTypeLookup } from "./discriminants";

export type { PayloadTypeLookup };

/** resource → unique resolve-arm target resource names. */
export type ResolveTargetIndex = Map<string, string[]>;

export function resolveTargetIndex(query: QueryDefinition): ResolveTargetIndex {
  const out: ResolveTargetIndex = new Map();
  for (const projection of query.projections) {
    if (projection.resolveArms === null) continue;
    out.set(projection.resource, [
      ...new Set(projection.resolveArms.map((arm) => arm.target.resource)),
    ]);
  }
  return out;
}

/** Projections that emit a `projectOn*` shell / result type (excludes resolve-only). */
export function projectableProjections(query: QueryDefinition): ResourceProjection[] {
  return query.projections.filter((p) => p.resolveArms === null);
}

/** All expansions under a projection (flat body or flattened when-arms). */
export function allProjectionExpansions(projection: ResourceProjection): Expansion[] {
  if (projection.resolveArms !== null) {
    return [];
  }
  if (projection.arms !== null) {
    return projection.arms.flatMap((arm) => arm.expansions);
  }
  return projection.expansions;
}

/** Collection resource (`TabCollection: Tab[]`) → element resource name. */
export function collectionElement(payload: TypeExpr): string | null {
  if (payload.kind === "array" && payload.of.kind === "resourceRef") {
    return payload.of.name;
  }
  return null;
}

/**
 * Concrete projectable resource names when expanding a **resolve-only** locator
 * (`CustomReference resolve to Entry | Asset`). Does **not** strip resource-union
 * payloads (`EditorialModule: Hero | Tabs`) — those require an explicit
 * `on EditorialModule` (indirection goes through `resolve to`, like CustomReference).
 *
 * Returns `null` when `targetName` is already projectable, has no resolve arms,
 * or is not a resolve-only locator. Stops at resources that have an explicit
 * projectable projection.
 */
export function stripToConcreteMembers(
  targetName: string,
  resources: PayloadTypeLookup,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex,
  seen = new Set<string>()
): string[] | null {
  if (seen.has(targetName)) {
    return null;
  }
  seen.add(targetName);

  // Explicit projectable `on Target` (armed Entry, flat Asset, …) — do not strip.
  if (projected.has(targetName)) {
    return null;
  }

  const resolveRefs = resolveTargets.get(targetName);
  if (resolveRefs === undefined || resolveRefs.length === 0) {
    return null;
  }

  const members: string[] = [];
  for (const ref of resolveRefs) {
    const nested = stripToConcreteMembers(ref, resources, projected, resolveTargets, new Set(seen));
    if (nested === null) {
      members.push(ref);
    } else {
      members.push(...nested);
    }
  }
  return [...new Set(members)];
}
