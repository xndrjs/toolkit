/**
 * Require a projectable `on R` for every expansion / root site that materializes
 * an object projection (mirrors emit's `printTargetAliasType` coverage).
 */
import type { Expansion, QueryDefinition, ResourceConstruction, SourceSpan } from "../ir";
import type { DiagnosticSink } from "./diagnostic";
import {
  allProjectionExpansions,
  collectionElement,
  projectableProjections,
  resolveTargetIndex,
  stripToConcreteMembers,
} from "./projection-graph";
import type { ResourceTable } from "./symbols";

type RequiringSite = {
  targetName: string;
  span: SourceSpan | null;
  path: string;
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

  const requireProjected = (
    resourceName: string,
    span: SourceSpan | null,
    sitePath: string
  ): void => {
    if (projected.has(resourceName) || reported.has(resourceName)) {
      return;
    }
    reported.add(resourceName);
    sink.push({
      code: "MISSING_ON_PROJECTION",
      message: `Query '${query.name}' expands '${resourceName}' but has no 'on ${resourceName}' projection`,
      path: sitePath,
      span,
      data: { missingResource: resourceName },
    });
  };

  const checkSite = (site: RequiringSite): void => {
    const resource = resources.get(site.targetName);
    if (!resource) {
      return;
    }

    const payload = resource.payloadType;

    // Collection resource (`TabCollection: Tab[]`) → require element `on`.
    const element = collectionElement(payload);
    if (element !== null) {
      requireProjected(element, site.span, site.path);
      return;
    }

    if (projected.has(site.targetName)) {
      return;
    }

    const stripped = stripToConcreteMembers(site.targetName, resources, projected, resolveTargets);
    if (stripped !== null && stripped.length > 0) {
      for (const member of stripped) {
        requireProjected(member, site.span, site.path);
      }
      return;
    }

    if (payload.kind === "object") {
      requireProjected(site.targetName, site.span, site.path);
    }
  };

  for (const site of requiringSites(query, path)) {
    checkSite(site);
  }
}

/** Roots + expansion targets under projectable (non-resolve-only) projections. */
function requiringSites(query: QueryDefinition, path: string): RequiringSite[] {
  const sites: RequiringSite[] = [];

  for (let i = 0; i < query.roots.length; i++) {
    const root = query.roots[i]!;
    const rootPath = root.alias === null ? `${path}.roots.${i}` : `${path}.roots.${root.alias}`;
    sites.push(siteFromConstruction(root.construction, root.span, rootPath));
  }

  for (const projection of projectableProjections(query)) {
    const projPath = `${path}.projections.${projection.binding}`;
    for (const expansion of allProjectionExpansions(projection)) {
      sites.push(...sitesFromExpansion(expansion, projPath));
    }
  }

  return sites;
}

function sitesFromExpansion(expansion: Expansion, projPath: string): RequiringSite[] {
  const expPath = `${projPath}.expansions.${expansion.alias}`;

  if (expansion.multiplicity === "many" && expansion.comprehension !== null) {
    return expansion.comprehension.arms.map((arm, i) =>
      siteFromConstruction(arm.target, expansion.span, `${expPath}.arms.${i}`)
    );
  }

  if (expansion.target !== null) {
    return [siteFromConstruction(expansion.target, expansion.span, expPath)];
  }

  return [];
}

function siteFromConstruction(
  construction: ResourceConstruction,
  fallbackSpan: SourceSpan | null,
  path: string
): RequiringSite {
  return {
    targetName: construction.resource,
    span: construction.span ?? fallbackSpan,
    path,
  };
}
