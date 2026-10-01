import type {
  DatasourceDefinition,
  Expansion,
  OnFailurePolicy,
  Program,
  ProjectionArm,
  ProjectionArmBody,
  QueryDefinition,
  ResourceConstruction,
  ResourceProjection,
  ResolveArm,
  TypeExpr,
} from "../ir";
import { analyzePayloadFilter, residualPayloadAfterFilters } from "../check/discriminants";
import { queryReferencedResources } from "../check/check-datasources";
import {
  projectableProjections,
  type ResolveTargetIndex,
  type ResolveTargetInfo,
} from "../check/projection-graph";
import { resolveSelectedFields } from "../check/projection-include";
import type { ResourceSymbols, ResourceTable } from "../check/symbols";

export type ResolvedConstruction = Readonly<{
  source: ResourceConstruction;
  resource: ResourceSymbols | null;
}>;

export type PlannedExpansion = Readonly<{
  source: Expansion;
  target: ResolvedConstruction | null;
  armTargets: readonly ResolvedConstruction[];
  failurePolicies: readonly OnFailurePolicy[];
}>;

export type PlannedProjectionBody = Readonly<{
  source: ProjectionArmBody;
  payloadType: TypeExpr;
  selectedFields: readonly string[];
  expansions: readonly PlannedExpansion[];
}>;

export type PlannedProjectionArm = PlannedProjectionBody &
  Readonly<{
    source: ProjectionArm;
    index: number;
    reachable: boolean;
    narrowing: "proven" | "conservative";
  }>;

export type PlannedResolveArm = Readonly<{
  source: ResolveArm;
  index: number;
  payloadType: TypeExpr;
  reachable: boolean;
  narrowing: "proven" | "conservative";
  target: ResolvedConstruction;
}>;

export type ProjectionPlan = Readonly<{
  source: ResourceProjection;
  resource: ResourceSymbols | null;
  kind: "flat" | "armed" | "redirect" | "resolveEach";
  reachable: boolean;
  flatBody: PlannedProjectionBody | null;
  arms: readonly PlannedProjectionArm[];
  defaultArm: (PlannedProjectionBody & Readonly<{ reachable: boolean }>) | null;
  resolveArms: readonly PlannedResolveArm[];
  resolveEach: PlannedExpansion | null;
}>;

export type DatasourceCoveragePlan = Readonly<{
  referencedResources: readonly string[];
  datasources: readonly string[];
  uncoveredResources: readonly string[];
}>;

export type QueryPlan = Readonly<{
  query: QueryDefinition;
  roots: readonly ResolvedConstruction[];
  projections: readonly ProjectionPlan[];
  projectableProjections: readonly ProjectionPlan[];
  projectedResources: ReadonlySet<string>;
  projectionsByResource: ReadonlyMap<string, ProjectionPlan>;
  redirectTargets: ResolveTargetIndex;
  hasRedirects: boolean;
  failurePolicies: readonly OnFailurePolicy[];
  needsFailureProjection: boolean;
  usesSetError: boolean;
  reachableResources: ReadonlySet<string>;
  datasourceCoverage: DatasourceCoveragePlan;
}>;

function frozen<T>(items: T[]): readonly T[] {
  return Object.freeze(items);
}

function resolveConstruction(
  source: ResourceConstruction,
  resources: ResourceTable
): ResolvedConstruction {
  return Object.freeze({ source, resource: resources.get(source.resource) ?? null });
}

function planExpansion(source: Expansion, resources: ResourceTable): PlannedExpansion {
  const armTargets =
    source.comprehension?.arms.map((arm) => resolveConstruction(arm.target, resources)) ?? [];
  const failurePolicies =
    source.multiplicity === "one"
      ? [source.onFailure]
      : (source.comprehension?.arms.map((arm) => arm.onFailure) ?? []);
  return Object.freeze({
    source,
    target: source.target === null ? null : resolveConstruction(source.target, resources),
    armTargets: frozen(armTargets),
    failurePolicies: frozen(failurePolicies),
  });
}

function planBody(
  projection: ResourceProjection,
  source: ProjectionArmBody,
  payloadType: TypeExpr,
  resources: ResourceTable
): PlannedProjectionBody {
  return Object.freeze({
    source,
    payloadType,
    selectedFields: frozen(
      resolveSelectedFields(
        source.selectedFields,
        source.expansions,
        source.include ?? projection.include,
        payloadType,
        resources,
        source.excludedFields
      )
    ),
    expansions: frozen(source.expansions.map((expansion) => planExpansion(expansion, resources))),
  });
}

function priorResidual(
  payloadType: TypeExpr,
  arms: readonly ProjectionArm[] | readonly ResolveArm[],
  index: number,
  binding: string,
  resources: ResourceTable
): TypeExpr | null {
  if (arms.slice(0, index).some((arm) => arm.when === null)) return null;
  const prior = arms
    .slice(0, index)
    .map((arm) => arm.when)
    .filter((when): when is NonNullable<typeof when> => when !== null);
  return residualPayloadAfterFilters(payloadType, prior, binding, resources) ?? payloadType;
}

function plannedRedirectTargets(projections: readonly ProjectionPlan[]): ResolveTargetIndex {
  const targets = new Map<string, ResolveTargetInfo>();
  for (const projection of projections) {
    if (projection.kind === "redirect") {
      targets.set(projection.source.resource, {
        targets: [
          ...new Set(
            projection.resolveArms
              .filter((arm) => arm.reachable)
              .map((arm) => arm.source.target.resource)
          ),
        ],
        multiplicity: "one",
        eachArms: null,
      });
    } else if (projection.kind === "resolveEach" && projection.source.resolveEach !== null) {
      targets.set(projection.source.resource, {
        targets: [...new Set(projection.source.resolveEach.arms.map((arm) => arm.target.resource))],
        multiplicity: "many",
        eachArms: projection.source.resolveEach.arms.map((arm) => ({
          resource: arm.target.resource,
          onFailure: arm.onFailure,
        })),
      });
    }
  }
  return targets;
}

function plannedFailurePolicies(
  projections: readonly ProjectionPlan[]
): readonly OnFailurePolicy[] {
  const policies: OnFailurePolicy[] = [];
  const collect = (expansions: readonly PlannedExpansion[]): void => {
    for (const expansion of expansions) policies.push(...expansion.failurePolicies);
  };
  for (const projection of projections) {
    if (projection.flatBody !== null) collect(projection.flatBody.expansions);
    for (const arm of projection.arms) {
      if (arm.reachable) collect(arm.expansions);
    }
    if (projection.defaultArm?.reachable) collect(projection.defaultArm.expansions);
    if (projection.resolveEach !== null) policies.push(...projection.resolveEach.failurePolicies);
  }
  return frozen(policies);
}

function armPayload(
  payloadType: TypeExpr,
  arms: readonly ProjectionArm[] | readonly ResolveArm[],
  index: number,
  binding: string,
  resources: ResourceTable
): { payloadType: TypeExpr; reachable: boolean; narrowing: "proven" | "conservative" } {
  const remaining = priorResidual(payloadType, arms, index, binding, resources);
  if (remaining === null) {
    return { payloadType, reachable: false, narrowing: "proven" };
  }
  const when = arms[index]!.when;
  if (when === null) {
    return { payloadType: remaining, reachable: true, narrowing: "proven" };
  }
  const narrowed = analyzePayloadFilter(remaining, when, binding, resources);
  if (!narrowed.analyzable) {
    return { payloadType: remaining, reachable: true, narrowing: "conservative" };
  }
  return {
    payloadType: narrowed.payloadType ?? remaining,
    reachable: narrowed.payloadType !== null,
    narrowing: narrowed.precise ? "proven" : "conservative",
  };
}

function planProjection(
  source: ResourceProjection,
  resources: ResourceTable,
  reachableResources: ReadonlySet<string>
): ProjectionPlan {
  const resource = resources.get(source.resource) ?? null;
  const payloadType = resource?.payloadType ?? { kind: "object", fields: [], span: null };
  const reachable = reachableResources.has(source.resource);

  if (source.resolveArms !== null) {
    const resolveArms = source.resolveArms.map((arm, index) => {
      const narrowed = armPayload(
        payloadType,
        source.resolveArms!,
        index,
        source.binding,
        resources
      );
      return Object.freeze({
        source: arm,
        index,
        ...narrowed,
        target: resolveConstruction(arm.target, resources),
      });
    });
    return Object.freeze({
      source,
      resource,
      kind: "redirect" as const,
      reachable,
      flatBody: null,
      arms: frozen([]),
      defaultArm: null,
      resolveArms: frozen(resolveArms),
      resolveEach: null,
    });
  }

  if (source.resolveEach !== null) {
    const synthetic: Expansion = {
      alias: "",
      target: null,
      multiplicity: "many",
      comprehension: {
        itemBinding: source.resolveEach.itemBinding,
        source: source.resolveEach.source,
        arms: source.resolveEach.arms,
      },
      onFailure: "throw",
      span: source.span,
    };
    return Object.freeze({
      source,
      resource,
      kind: "resolveEach" as const,
      reachable,
      flatBody: null,
      arms: frozen([]),
      defaultArm: null,
      resolveArms: frozen([]),
      resolveEach: planExpansion(synthetic, resources),
    });
  }

  if (source.arms !== null) {
    const arms = source.arms.map((arm, index) => {
      const narrowed = armPayload(payloadType, source.arms!, index, source.binding, resources);
      return Object.freeze({
        ...planBody(source, arm, narrowed.payloadType, resources),
        source: arm,
        index,
        reachable: narrowed.reachable,
        narrowing: narrowed.narrowing,
      });
    });
    const residual = residualPayloadAfterFilters(
      payloadType,
      source.arms.map((arm) => arm.when),
      source.binding,
      resources
    );
    const defaultArm =
      source.defaultArm === null
        ? null
        : Object.freeze({
            ...planBody(source, source.defaultArm, residual ?? payloadType, resources),
            reachable: residual !== null,
          });
    return Object.freeze({
      source,
      resource,
      kind: "armed" as const,
      reachable,
      flatBody: null,
      arms: frozen(arms),
      defaultArm,
      resolveArms: frozen([]),
      resolveEach: null,
    });
  }

  return Object.freeze({
    source,
    resource,
    kind: "flat" as const,
    reachable,
    flatBody: planBody(source, source, payloadType, resources),
    arms: frozen([]),
    defaultArm: null,
    resolveArms: frozen([]),
    resolveEach: null,
  });
}

function possibleEdges(query: QueryDefinition): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  const add = (from: string, to: string): void => {
    const targets = edges.get(from) ?? new Set<string>();
    targets.add(to);
    edges.set(from, targets);
  };
  for (const projection of query.projections) {
    const collectExpansion = (expansion: Expansion): void => {
      if (expansion.target !== null) add(projection.resource, expansion.target.resource);
      for (const arm of expansion.comprehension?.arms ?? []) {
        add(projection.resource, arm.target.resource);
      }
    };
    projection.expansions.forEach(collectExpansion);
    projection.arms?.forEach((arm) => arm.expansions.forEach(collectExpansion));
    projection.defaultArm?.expansions.forEach(collectExpansion);
    projection.resolveArms?.forEach((arm) => add(projection.resource, arm.target.resource));
    projection.resolveEach?.arms.forEach((arm) => add(projection.resource, arm.target.resource));
  }
  return edges;
}

function reachableResources(query: QueryDefinition): ReadonlySet<string> {
  const edges = possibleEdges(query);
  const reachable = new Set(query.roots.map((root) => root.construction.resource));
  const pending = [...reachable];
  while (pending.length > 0) {
    const current = pending.shift()!;
    for (const target of edges.get(current) ?? []) {
      if (reachable.has(target)) continue;
      reachable.add(target);
      pending.push(target);
    }
  }
  return reachable;
}

function datasourceCoverage(
  query: QueryDefinition,
  datasources: readonly DatasourceDefinition[]
): DatasourceCoveragePlan {
  const referencedResources = [...queryReferencedResources(query)].sort();
  const names = datasources
    .filter((datasource) =>
      datasource.routes.some((route) => referencedResources.includes(route.resource))
    )
    .map((datasource) => datasource.name);
  const covered = new Set(
    datasources.flatMap((datasource) => datasource.routes.map((route) => route.resource))
  );
  return Object.freeze({
    referencedResources: frozen(referencedResources),
    datasources: frozen(names),
    uncoveredResources: frozen(referencedResources.filter((name) => !covered.has(name))),
  });
}

export function buildQueryPlans(program: Program, resources: ResourceTable): readonly QueryPlan[] {
  return frozen(
    program.queries.map((query) => {
      const reachable = reachableResources(query);
      const projections = frozen(
        query.projections.map((projection) => planProjection(projection, resources, reachable))
      );
      const projectable = new Set(projectableProjections(query));
      const projectablePlans = frozen(
        projections.filter((projection) => projectable.has(projection.source))
      );
      const redirectTargets = plannedRedirectTargets(projections);
      const failurePolicies = plannedFailurePolicies(projections);
      return Object.freeze({
        query,
        roots: frozen(query.roots.map((root) => resolveConstruction(root.construction, resources))),
        projections,
        projectableProjections: projectablePlans,
        projectedResources: new Set(
          projectablePlans.map((projection) => projection.source.resource)
        ),
        projectionsByResource: new Map(
          projectablePlans.map((projection) => [projection.source.resource, projection])
        ),
        redirectTargets,
        hasRedirects: [...redirectTargets.values()].some((target) => target.multiplicity === "one"),
        failurePolicies,
        needsFailureProjection: failurePolicies.some((policy) => policy !== "throw"),
        usesSetError: failurePolicies.some((policy) => policy === "setError"),
        reachableResources: reachable,
        datasourceCoverage: datasourceCoverage(query, program.datasources),
      });
    })
  );
}
