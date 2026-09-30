/**
 * Emit query-scoped projection TypeScript types from checked queries.
 *
 * Per single-root query `PostDetail`:
 * ```ts
 * export type PostDetail_User = { … };
 * export type PostDetail_Post = { …; author: PostDetail_User };
 * export type PostDetailResult = PostDetail_Post;
 * ```
 *
 * Multi-root queries key the aggregate by alias:
 * ```ts
 * export type HomepageResult = {
 *   page: Homepage_Page;
 *   session: Homepage_UserSession;
 * };
 * ```
 *
 * Armed `on Entry` emits variant shells + a union alias:
 * ```ts
 * export type PostDetail_Entry_Hero = { type: "Hero"; … };
 * export type PostDetail_Entry_Page = { id: EntryId };
 * export type PostDetail_Entry = PostDetail_Entry_Hero | PostDetail_Entry_Page;
 * ```
 *
 * Optional `resourceTag` (e.g. `"$type"`) stamps the resource name onto each
 * projection type. Off by default — payload/resource shape stays DSL-driven.
 *
 * Alias types restore expansion names. Resolve-only locators strip to settle-target
 * projection types: 1→1 → union (`Entry | Asset`); resolve-to-each → array
 * (`Tab[]` / `(Tab | Strip)[]`) with per-arm `on failure` widen. Resource-union
 * payloads require an explicit projectable `on` (no silent strip to member
 * projectors). Resolve-only `on R resolve to` / `resolve to each` is not itself a
 * projection type.
 */
import { createDiagnosticSink } from "../../../check/diagnostic";
import { expandPayloadObjectMembers, isObjectLikePayload } from "../../../check/discriminants";
import { stripToConcreteMembers, type ResolveTargetIndex } from "../../../check/projection-graph";
import type {
  PlannedProjectionArm,
  PlannedProjectionBody,
  ProgramAnalysis,
  ProjectionPlan,
  QueryPlan,
} from "../../../check";
import { payloadIntersectionFields } from "../../../check/projection-include";
import { resolveTypeExpr } from "../../../check/resolve-type";
import type { ResourceTable, ScalarTable } from "../../../check/symbols";
import type {
  Expansion,
  FieldDecl,
  OnFailurePolicy,
  ResourceConstruction,
  ResourceProjection,
  RefersTarget,
  TypeExpr,
} from "../../../ir";
import { isSingleRootQuery } from "../../../ir";
import { printTypeExpr } from "../resources";
import { codegenAnalysis, type CodegenInput } from "../analysis";
import { projectionArmDiscriminant } from "../shared";
import {
  payloadTypeName,
  projectionTypeName,
  projectionVariantTypeName,
  queryResultTypeName,
} from "../naming";
import {
  collectApplicableRefers,
  comprehensionElementType,
  membersMatchingApplicableRefers,
  printNarrowedArmedAliasType,
  type ExpansionAliasContext,
} from "./refers-narrow";

export type { ExpansionAliasContext } from "./refers-narrow";

function resolveForEmit(
  type: TypeExpr,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable
): TypeExpr {
  const sink = createDiagnosticSink();
  const resolved = resolveTypeExpr(type, path, scalars, resources, sink);
  if (!resolved || sink.diagnostics.length > 0) {
    const detail =
      sink.diagnostics.map((d) => d.message).join("; ") || "resolution returned undefined";
    throw new Error(`emitProjectionTypes: failed to resolve '${path}': ${detail}`);
  }
  return resolved;
}

/**
 * TypeScript type string for an expansion alias under `queryName`.
 * - ordinary resource → `Query_Resource`
 * - union / resolve-only resource → `Query_A | Query_B | …` (member projections)
 * - `many` / multi-arm → union of arm targets, wrapped in an array
 * - with `refers` + armed `on R` → narrowed variant union (e.g. `Query_Entry_Menu`)
 * - `on failure set null` / `set error` widen each edge (`T | null` / `T | ResolutionErrorData`)
 */
export function printExpansionAliasType(
  queryName: string,
  expansion: Expansion,
  resources: ResourceTable,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex = new Map(),
  context: ExpansionAliasContext | null = null
): string {
  if (expansion.multiplicity === "many" && expansion.comprehension !== null) {
    const itemType =
      context !== null
        ? comprehensionElementType(expansion.comprehension.source, context.sourcePayload, resources)
        : null;
    const armTypes = expansion.comprehension.arms.map((arm) => {
      const refers =
        context !== null && itemType !== null
          ? collectApplicableRefers(arm.target, itemType, resources)
          : [];
      const base = printTargetAliasType(
        queryName,
        arm.target,
        resources,
        projected,
        resolveTargets,
        refers,
        context
      );
      return wrapOnFailureType(base, arm.onFailure);
    });
    // Deduplicate while preserving order.
    const unique: string[] = [];
    for (const t of armTypes) {
      if (!unique.includes(t)) unique.push(t);
    }
    const base = unique.join(" | ");
    return base.includes("|") ? `(${base})[]` : `${base}[]`;
  }

  if (expansion.target === null) {
    throw new Error(`emitProjectionTypes: one-expand missing target in query '${queryName}'`);
  }

  const refers =
    context !== null
      ? collectApplicableRefers(expansion.target, context.sourcePayload, resources)
      : [];
  const base = printTargetAliasType(
    queryName,
    expansion.target,
    resources,
    projected,
    resolveTargets,
    refers,
    context
  );
  return wrapOnFailureType(base, expansion.onFailure);
}

/** Widen a projected alias for `on failure set null` / `set error`. */
export function wrapOnFailureType(base: string, onFailure: OnFailurePolicy): string {
  if (onFailure === "throw") return base;
  const inner = base.includes("|") ? `(${base})` : base;
  if (onFailure === "setNull") return `${inner} | null`;
  return `${inner} | ResolutionErrorData`;
}

function printTargetAliasType(
  queryName: string,
  target: ResourceConstruction | string,
  resources: ResourceTable,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex,
  refers: RefersTarget[] = [],
  context: ExpansionAliasContext | null = null
): string {
  const targetName = typeof target === "string" ? target : target.resource;
  if (!resources.has(targetName)) {
    throw new Error(
      `emitProjectionTypes: unknown expansion target '${targetName}' in query '${queryName}'`
    );
  }

  // Prefer an explicit projectable `on Target` projection (armed Entry, flat object, …).
  if (projected.has(targetName)) {
    const narrowed = tryNarrowArmedAlias(queryName, targetName, refers, context, resources);
    if (narrowed !== null) {
      return narrowed;
    }
    return projectionTypeName(queryName, targetName);
  }

  // resolve-to-each → `(T1 | T2 | …)[]` with per-arm onFailure (same as many-expand).
  const resolveInfo = resolveTargets.get(targetName);
  if (
    resolveInfo !== undefined &&
    resolveInfo.multiplicity === "many" &&
    resolveInfo.eachArms !== null &&
    resolveInfo.eachArms.length > 0
  ) {
    const armTypes = resolveInfo.eachArms.map((arm) => {
      const base = printTargetAliasType(
        queryName,
        arm.resource,
        resources,
        projected,
        resolveTargets,
        refers,
        context
      );
      return wrapOnFailureType(base, arm.onFailure);
    });
    const unique: string[] = [];
    for (const t of armTypes) {
      if (!unique.includes(t)) unique.push(t);
    }
    const joined = unique.join(" | ");
    return joined.includes("|") ? `(${joined})[]` : `${joined}[]`;
  }

  // 1→1 resolve-only locator → union of settle-target projection types.
  const stripped = stripToConcreteMembers(targetName, resources, projected, resolveTargets);
  if (stripped !== null && stripped.members.length > 0) {
    for (const member of stripped.members) {
      requireProjected(queryName, member, projected, `resolve target of '${targetName}'`);
    }
    const union = stripped.members.map((m) => projectionTypeName(queryName, m)).join(" | ");
    if (stripped.multiplicity === "many") {
      return stripped.members.length === 1 ? `${union}[]` : `(${union})[]`;
    }
    return union;
  }

  // Object / collection / resource-union / resourceRef payloads require an explicit `on Target`
  // (no silent strip of `EditorialModule: Hero | Tabs` onto member projectors;
  // no collection → element array fan-out).
  requireProjected(queryName, targetName, projected, `expansion target '${targetName}'`);
  return projectionTypeName(queryName, targetName);
}

/**
 * When `refers` applies and the query has an armed `on R`, emit the matching
 * variant union. Flat (non-armed) projections are not structurally narrowed.
 */
function tryNarrowArmedAlias(
  queryName: string,
  targetName: string,
  refers: RefersTarget[],
  context: ExpansionAliasContext | null,
  resources: ResourceTable
): string | null {
  if (refers.length === 0 || context === null) {
    return null;
  }
  const projection = context.projectionsByResource.get(targetName);
  if (!projection || projection.arms === null) {
    return null;
  }
  const matched = membersMatchingApplicableRefers(targetName, refers, resources);
  if (matched === null || matched.length === 0) {
    return null;
  }
  return printNarrowedArmedAliasType(queryName, targetName, matched, projection, resources);
}
function requireProjected(
  queryName: string,
  resourceName: string,
  projected: ReadonlySet<string>,
  label: string
): void {
  if (!projected.has(resourceName)) {
    throw new Error(
      `emitProjectionTypes: query '${queryName}' expands ${label} '${resourceName}' but has no 'on ${resourceName}' projection`
    );
  }
}

/**
 * Field lookup for a (possibly narrowed) payload.
 * - Single object → that object's fields
 * - Closed object union → intersection fields (same bar as `payloadSelectableFields`)
 * - Otherwise → `resourcePayload` fallback
 */
function fieldMapFromPayload(
  payloadType: TypeExpr,
  resourcePayload: Map<string, FieldDecl>,
  resources: ResourceTable
): Map<string, FieldDecl> {
  const members = expandPayloadObjectMembers(payloadType, resources);
  if (members === null) {
    return resourcePayload;
  }
  return fieldMap(payloadIntersectionFields(payloadType, resources));
}

function fieldMap(fields: FieldDecl[]): Map<string, FieldDecl> {
  return new Map(fields.map((f) => [f.name, f]));
}

function emitArmBodyVariantType(
  queryName: string,
  projection: ResourceProjection,
  arm: PlannedProjectionBody,
  variant: string,
  fieldPath: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: ReadonlyMap<string, ProjectionPlan>,
  resourceTag?: string
): { typeName: string; source: string } {
  const typeName = projectionVariantTypeName(queryName, projection.resource, variant);
  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown resource '${projection.resource}' in query '${queryName}'`
    );
  }

  const payloadFields = fieldMapFromPayload(arm.payloadType, resource.payload, resources);
  const expansionContext: ExpansionAliasContext = {
    sourcePayload: arm.payloadType,
    projectionsByResource,
  };

  const lines: string[] = [];
  if (resourceTag !== undefined) {
    lines.push(`  ${resourceTag}: ${JSON.stringify(projection.resource)};`);
  }

  for (const fieldName of arm.selectedFields) {
    const field = payloadFields.get(fieldName);
    if (!field) {
      throw new Error(
        `emitProjectionTypes: selected field '${fieldName}' is not on narrowed payload of '${projection.resource}' arm '${variant}'`
      );
    }
    const path = `${fieldPath}.selectedFields.${fieldName}`;
    const resolved = resolveForEmit(field.type, path, scalars, resources);
    lines.push(`  ${fieldName}${field.optional ? "?" : ""}: ${printTypeExpr(resolved)};`);
  }

  for (const plannedExpansion of arm.expansions) {
    const expansion = plannedExpansion.source;
    const aliasType = printExpansionAliasType(
      queryName,
      expansion,
      resources,
      projected,
      resolveTargets,
      expansionContext
    );
    lines.push(`  ${expansion.alias}: ${aliasType};`);
  }

  return {
    typeName,
    source:
      lines.length === 0
        ? `export type ${typeName} = {};`
        : `export type ${typeName} = {\n${lines.join("\n")}\n};`,
  };
}

function emitArmVariantType(
  queryName: string,
  projection: ResourceProjection,
  arm: PlannedProjectionArm,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: ReadonlyMap<string, ProjectionPlan>,
  resourceTag?: string
): { typeName: string; source: string } {
  const disc = projectionArmDiscriminant(arm.source.when, projection.binding);
  const variant = disc ?? `Arm${arm.index}`;

  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown resource '${projection.resource}' in query '${queryName}'`
    );
  }

  return emitArmBodyVariantType(
    queryName,
    projection,
    arm,
    variant,
    `queries.${queryName}.projections.${projection.binding}.arms.${arm.index}`,
    scalars,
    resources,
    projected,
    resolveTargets,
    projectionsByResource,
    resourceTag
  );
}

function emitDefaultArmVariantType(
  queryName: string,
  projection: ProjectionPlan,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: ReadonlyMap<string, ProjectionPlan>,
  resourceTag?: string
): { typeName: string; source: string } {
  const defaultArm = projection.defaultArm;
  if (defaultArm === null) {
    throw new Error("emitProjectionTypes: emitDefaultArmVariantType called without defaultArm");
  }
  const resource = resources.get(projection.source.resource);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown resource '${projection.source.resource}' in query '${queryName}'`
    );
  }
  const typeName = projectionVariantTypeName(queryName, projection.source.resource, "Default");
  if (!defaultArm.reachable) {
    return { typeName, source: `export type ${typeName} = never;` };
  }
  return emitArmBodyVariantType(
    queryName,
    projection.source,
    defaultArm,
    "Default",
    `queries.${queryName}.projections.${projection.source.binding}.defaultArm`,
    scalars,
    resources,
    projected,
    resolveTargets,
    projectionsByResource,
    resourceTag
  );
}

function emitArmedResourceProjectionTypes(
  queryName: string,
  projectionPlan: ProjectionPlan,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: ReadonlyMap<string, ProjectionPlan>,
  resourceTag?: string
): string {
  const projection = projectionPlan.source;
  const arms = projectionPlan.arms;
  if (projection.arms === null) {
    throw new Error("emitProjectionTypes: emitArmedResourceProjectionTypes called without arms");
  }
  if (projectionPlan.defaultArm === null) {
    throw new Error(
      `emitProjectionTypes: armed 'on ${projection.resource}' missing defaultArm in query '${queryName}'`
    );
  }

  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown resource '${projection.resource}' in query '${queryName}'`
    );
  }
  if (!isObjectLikePayload(resource.payloadType, resources)) {
    throw new Error(
      `emitProjectionTypes: cannot arm when-clauses on non-object payload of '${projection.resource}' in query '${queryName}'`
    );
  }

  const variants: string[] = [];
  const parts: string[] = [];

  for (const arm of arms) {
    if (!arm.reachable) continue;
    const { typeName, source } = emitArmVariantType(
      queryName,
      projection,
      arm,
      scalars,
      resources,
      projected,
      resolveTargets,
      projectionsByResource,
      resourceTag
    );
    variants.push(typeName);
    parts.push(source);
  }

  const { typeName: defaultName, source: defaultSource } = emitDefaultArmVariantType(
    queryName,
    projectionPlan,
    scalars,
    resources,
    projected,
    resolveTargets,
    projectionsByResource,
    resourceTag
  );
  variants.push(defaultName);
  parts.push(defaultSource);

  const unionName = projectionTypeName(queryName, projection.resource);
  parts.push(`export type ${unionName} = ${variants.join(" | ")};`);
  return parts.join("\n\n");
}

function emitFlatResourceProjectionType(
  queryName: string,
  projectionPlan: ProjectionPlan,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: ReadonlyMap<string, ProjectionPlan>,
  resourceTag?: string
): string {
  const projection = projectionPlan.source;
  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown resource '${projection.resource}' in query '${queryName}'`
    );
  }

  const typeName = projectionTypeName(queryName, projection.resource);

  // Array / scalar / primitive payloads: empty `on R` is a payload passthrough.
  if (!isObjectLikePayload(resource.payloadType, resources)) {
    const hasBody =
      projection.selectedFields.length > 0 ||
      projection.expansions.length > 0 ||
      projection.include === "all" ||
      projection.include === "properties";
    if (hasBody) {
      throw new Error(
        `emitProjectionTypes: cannot project fields/expands on non-object payload of '${projection.resource}' in query '${queryName}'`
      );
    }
    return `export type ${typeName} = ${payloadTypeName(projection.resource)};`;
  }

  const lines: string[] = [];
  if (resourceTag !== undefined) {
    lines.push(`  ${resourceTag}: ${JSON.stringify(projection.resource)};`);
  }
  const expansionContext: ExpansionAliasContext = {
    sourcePayload: resource.payloadType,
    projectionsByResource,
  };

  const flatBody = projectionPlan.flatBody;
  if (flatBody === null) {
    throw new Error("emitProjectionTypes: flat projection is missing its semantic body");
  }

  const payloadFields = fieldMapFromPayload(resource.payloadType, resource.payload, resources);
  for (const fieldName of flatBody.selectedFields) {
    const field = payloadFields.get(fieldName);
    if (!field) {
      throw new Error(
        `emitProjectionTypes: selected field '${fieldName}' is not on payload of '${projection.resource}'`
      );
    }
    const path = `queries.${queryName}.projections.${projection.binding}.selectedFields.${fieldName}`;
    const resolved = resolveForEmit(field.type, path, scalars, resources);
    lines.push(`  ${fieldName}${field.optional ? "?" : ""}: ${printTypeExpr(resolved)};`);
  }

  for (const expansion of projection.expansions) {
    const aliasType = printExpansionAliasType(
      queryName,
      expansion,
      resources,
      projected,
      resolveTargets,
      expansionContext
    );
    lines.push(`  ${expansion.alias}: ${aliasType};`);
  }

  return lines.length === 0
    ? `export type ${typeName} = {};`
    : `export type ${typeName} = {\n${lines.join("\n")}\n};`;
}

function emitResourceProjectionType(
  queryName: string,
  projection: ProjectionPlan,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: ReadonlySet<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: ReadonlyMap<string, ProjectionPlan>,
  resourceTag?: string
): string {
  if (projection.kind === "armed") {
    return emitArmedResourceProjectionTypes(
      queryName,
      projection,
      scalars,
      resources,
      projected,
      resolveTargets,
      projectionsByResource,
      resourceTag
    );
  }
  return emitFlatResourceProjectionType(
    queryName,
    projection,
    scalars,
    resources,
    projected,
    resolveTargets,
    projectionsByResource,
    resourceTag
  );
}

function emitQueryProjectionTypes(
  plan: QueryPlan,
  scalars: ScalarTable,
  resources: ResourceTable,
  resourceTag?: string
): string {
  const query = plan.query;
  const projectable = plan.projectableProjections;
  const projected = plan.projectedResources;
  const resolveTargets = plan.redirectTargets;
  const projectionsByResource = plan.projectionsByResource;
  const parts: string[] = [];

  for (const projection of projectable) {
    parts.push(
      emitResourceProjectionType(
        query.name,
        projection,
        scalars,
        resources,
        projected,
        resolveTargets,
        projectionsByResource,
        resourceTag
      )
    );
  }

  const resultTypeName = queryResultTypeName(query.name);

  if (isSingleRootQuery(query)) {
    const rootResource = query.roots[0]!.construction.resource;
    const rootType = printTargetAliasType(
      query.name,
      rootResource,
      resources,
      projected,
      resolveTargets
    );
    parts.push(`export type ${resultTypeName} = ${rootType};`);
  } else {
    const fields: string[] = [];
    for (const root of query.roots) {
      if (root.alias === null) {
        throw new Error(`emitProjectionTypes: multi-root query '${query.name}' has a null alias`);
      }
      const rootType = printTargetAliasType(
        query.name,
        root.construction.resource,
        resources,
        projected,
        resolveTargets
      );
      fields.push(`  ${root.alias}: ${rootType};`);
    }
    parts.push(`export type ${resultTypeName} = {\n${fields.join("\n")}\n};`);
  }

  return parts.join("\n\n");
}

/**
 * Emit query-scoped projection types (`Query_Resource`, `QueryResult`) for each query.
 * Returns an empty string when the program has no queries.
 *
 * @param resourceTag - Optional property name for a resource-name stamp on types.
 */
export function emitProjectionTypes(input: CodegenInput, resourceTag?: string): string {
  const analysis: ProgramAnalysis = codegenAnalysis(input);
  if (analysis.queries.length === 0) {
    return "";
  }

  return analysis.queries
    .map((query) =>
      emitQueryProjectionTypes(query, analysis.scalars, analysis.resources, resourceTag)
    )
    .join("\n\n");
}
