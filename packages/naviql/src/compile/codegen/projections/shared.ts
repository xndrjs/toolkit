import type {
  Program,
  QueryDefinition,
  ResourceDefinition,
  ResourceProjection,
  TypeExpr,
} from "../../../ir";

export type ResourceIndex = Map<string, ResourceDefinition>;

/** resource → unique resolve-arm target resource names. */
export type ResolveTargetIndex = Map<string, string[]>;

/** Minimal lookup used by {@link stripToConcreteMembers} (ResourceIndex or ResourceTable). */
export type PayloadTypeLookup = {
  get(name: string): { payloadType: TypeExpr } | undefined;
};

export function resourceIndex(program: Program): ResourceIndex {
  return new Map(program.resources.map((r) => [r.name, r]));
}

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

export function resourceRefsFromPayload(payload: TypeExpr): string[] | null {
  if (payload.kind === "resourceRef") {
    return [payload.name];
  }
  if (payload.kind === "union") {
    const names: string[] = [];
    for (const member of payload.members) {
      if (member.kind !== "resourceRef") {
        return null;
      }
      names.push(member.name);
    }
    return names;
  }
  return null;
}

/** Collection resource (`TabCollection: Tab[]`) → element resource name. */
export function collectionElement(payload: TypeExpr): string | null {
  if (payload.kind === "array" && payload.of.kind === "resourceRef") {
    return payload.of.name;
  }
  return null;
}

/**
 * Concrete object-payload resource names to expose when expanding `targetName`.
 * Follows resource-valued payloads (`Entry → Hero | Tabs`) and query-level
 * resolve arms (`CustomReference resolve to Entry | Asset`).
 * Returns `null` for ordinary object payloads (project as `targetName` itself).
 * Stops at resources that have an explicit projectable projection.
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
  if (resolveRefs !== undefined && resolveRefs.length > 0) {
    const members: string[] = [];
    for (const ref of resolveRefs) {
      const nested = stripToConcreteMembers(
        ref,
        resources,
        projected,
        resolveTargets,
        new Set(seen)
      );
      if (nested === null) {
        members.push(ref);
      } else {
        members.push(...nested);
      }
    }
    return [...new Set(members)];
  }

  const target = resources.get(targetName);
  if (!target) {
    return null;
  }

  const payload = target.payloadType;
  if (payload.kind === "object" || payload.kind === "array") {
    return null;
  }

  const refs = resourceRefsFromPayload(payload);
  if (refs === null || refs.length === 0) {
    return null;
  }

  const members: string[] = [];
  for (const ref of refs) {
    const nested = stripToConcreteMembers(ref, resources, projected, resolveTargets, new Set(seen));
    if (nested === null) {
      members.push(ref);
    } else {
      members.push(...nested);
    }
  }
  return [...new Set(members)];
}
