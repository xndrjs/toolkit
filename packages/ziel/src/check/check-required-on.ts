/**
 * Require a projectable `on R` for every expansion / root site that materializes
 * a projection (mirrors emit's `printTargetAliasType` coverage).
 *
 * Collection resources require `on` for the collection itself (`TabCollection: Tab[]`
 * → `on TabCollection`), same as object resources — the payload RHS is not traversed.
 * Resolve-only locators (1→1 or `resolve to each`) require settle-target `on`s
 * (e.g. expand `TabCollection` with `resolve to each … Tab` → `on Tab`, not a
 * projectable `on TabCollection`). Resource-union payloads require `on` for the
 * wrapper resource itself (`EditorialModule: Hero | Tabs` → `on EditorialModule`).
 *
 * Diagnostics are query-scoped: missing `on` is a property of the query as a
 * whole, not of any particular expand / root construction.
 */
import type { Expansion, QueryDefinition, ResourceConstruction } from "../ir";
import type { DiagnosticSink } from "./diagnostic";
import {
  allProjectionExpansions,
  projectableProjections,
  resolveTargetIndex,
  stripToConcreteMembers,
} from "./projection-graph";
import type { ResourceTable } from "./symbols";

type RequiringSite = {
  targetName: string;
};

/**
 * Emit `MISSING_ON_PROJECTION` when a root or expand target needs a projectable
 * `on` that the query does not declare. Resolve-only clauses do not satisfy.
 */
export function checkRequiredOn(
  query: QueryDefinition,
  path: string,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const projected = new Set(projectableProjections(query).map((p) => p.resource));
  const resolveTargets = resolveTargetIndex(query);
  const reported = new Set<string>();

  const requireProjected = (resourceName: string): void => {
    if (projected.has(resourceName) || reported.has(resourceName)) {
      return;
    }
    reported.add(resourceName);
    sink.push({
      code: "MISSING_ON_PROJECTION",
      message: `Query '${query.name}' expands '${resourceName}' but has no 'on ${resourceName}' projection`,
      path,
      span: query.span,
      data: { missingResource: resourceName },
    });
  };

  const checkSite = (site: RequiringSite): void => {
    const resource = resources.get(site.targetName);
    if (!resource) {
      return;
    }

    if (projected.has(site.targetName)) {
      return;
    }

    // Resolve-only locator (1→1 or resolve-to-each) → require settle targets.
    const stripped = stripToConcreteMembers(site.targetName, resources, projected, resolveTargets);
    if (stripped !== null && stripped.members.length > 0) {
      for (const member of stripped.members) {
        requireProjected(member);
      }
      return;
    }

    // Object / collection / resource-union / scalar payload → require `on` for
    // this resource itself (no collection → element fan-out).
    requireProjected(site.targetName);
  };

  for (const site of requiringSites(query)) {
    checkSite(site);
  }
}

/** Roots + expansion targets under projectable (non-resolve-only) projections. */
function requiringSites(query: QueryDefinition): RequiringSite[] {
  const sites: RequiringSite[] = [];

  for (const root of query.roots) {
    sites.push(siteFromConstruction(root.construction));
  }

  for (const projection of projectableProjections(query)) {
    for (const expansion of allProjectionExpansions(projection)) {
      sites.push(...sitesFromExpansion(expansion));
    }
  }

  return sites;
}

function sitesFromExpansion(expansion: Expansion): RequiringSite[] {
  if (expansion.multiplicity === "many" && expansion.comprehension !== null) {
    return expansion.comprehension.arms.map((arm) => siteFromConstruction(arm.target));
  }

  if (expansion.target !== null) {
    return [siteFromConstruction(expansion.target)];
  }

  return [];
}

function siteFromConstruction(construction: ResourceConstruction): RequiringSite {
  return { targetName: construction.resource };
}
