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
 * Alias types restore expansion names. Resolve-only locators strip to the union of
 * settle-target projection types; collection resources (`Tab[]`) become member arrays.
 * Resource-union payloads require an explicit projectable `on` (no silent strip to
 * member resource projectors). Resolve-only `on R resolve to` is not a projection
 * type — strip aliases follow resolve targets (e.g. `related: PageDetail_Entry | PageDetail_Asset`).
 */
import { createDiagnosticSink } from "../../../check/diagnostic";
import { expandPayloadObjectMembers, narrowPayloadByFilter } from "../../../check/discriminants";
import {
  projectableProjections,
  resolveTargetIndex,
  stripToConcreteMembers,
  type ResolveTargetIndex,
} from "../../../check/projection-graph";
import {
  payloadIntersectionFields,
  resolveSelectedFields,
} from "../../../check/projection-include";
import { resolveTypeExpr } from "../../../check/resolve-type";
import type { ResourceTable, ScalarTable } from "../../../check/symbols";
import type {
  Expansion,
  FieldDecl,
  Program,
  ProjectionArm,
  ProjectionArmBody,
  QueryDefinition,
  ResourceConstruction,
  ResourceProjection,
  RefersTarget,
  TypeExpr,
} from "../../../ir";
import { isSingleRootQuery } from "../../../ir";
import { printTypeExpr } from "../resources";
import { projectionArmDiscriminant } from "../shared";
import { projectionTypeName, projectionVariantTypeName, queryResultTypeName } from "../naming";
import {
  collectApplicableRefers,
  comprehensionElementType,
  membersMatchingApplicableRefers,
  printNarrowedArmedAliasType,
  type ExpansionAliasContext,
} from "./refers-narrow";

export type { ExpansionAliasContext } from "./refers-narrow";

function tablesFromProgram(program: Program): {
  scalars: ScalarTable;
  resources: ResourceTable;
} {
  const scalars: ScalarTable = new Map(program.scalars.map((s) => [s.name, s]));
  const resources: ResourceTable = new Map();
  // First pass: register names so union / resourceRef payloads can expand.
  for (const resource of program.resources) {
    resources.set(resource.name, {
      identity: new Map(resource.identity.fields.map((f) => [f.name, f])),
      payload: new Map(),
      payloadType: resource.payloadType,
    });
  }
  // Second pass: object fields, or intersection fields for closed object unions.
  for (const resource of program.resources) {
    const entry = resources.get(resource.name)!;
    entry.payload = fieldMapFromPayload(resource.payloadType, entry.payload, resources);
  }
  return { scalars, resources };
}

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
 * - collection (`R[]`) → `Query_R[]`
 * - `many` / multi-arm → union of arm targets, wrapped in an array
 * - with `refers` + armed `on R` → narrowed variant union (e.g. `Query_Entry_Menu`)
 */
export function printExpansionAliasType(
  queryName: string,
  expansion: Expansion,
  resources: ResourceTable,
  projected: Set<string>,
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
      return printTargetAliasType(
        queryName,
        arm.target,
        resources,
        projected,
        resolveTargets,
        refers,
        context
      );
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
  return printTargetAliasType(
    queryName,
    expansion.target,
    resources,
    projected,
    resolveTargets,
    refers,
    context
  );
}

function printTargetAliasType(
  queryName: string,
  target: ResourceConstruction | string,
  resources: ResourceTable,
  projected: Set<string>,
  resolveTargets: ResolveTargetIndex,
  refers: RefersTarget[] = [],
  context: ExpansionAliasContext | null = null
): string {
  const targetName = typeof target === "string" ? target : target.resource;
  const resource = resources.get(targetName);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown expansion target '${targetName}' in query '${queryName}'`
    );
  }

  const payload = resource.payloadType;

  if (payload.kind === "array" && payload.of.kind === "resourceRef") {
    const element = payload.of.name;
    requireProjected(queryName, element, projected, `collection element of '${targetName}'`);
    return `${projectionTypeName(queryName, element)}[]`;
  }

  // Prefer an explicit projectable `on Target` projection (armed Entry, flat object, …).
  if (projected.has(targetName)) {
    const narrowed = tryNarrowArmedAlias(queryName, targetName, refers, context, resources);
    if (narrowed !== null) {
      return narrowed;
    }
    return projectionTypeName(queryName, targetName);
  }

  // Resolve-only locator → alias is the union of settle-target projection types.
  const stripped = stripToConcreteMembers(targetName, resources, projected, resolveTargets);
  if (stripped !== null && stripped.length > 0) {
    for (const member of stripped) {
      requireProjected(queryName, member, projected, `resolve target of '${targetName}'`);
    }
    return stripped.map((m) => projectionTypeName(queryName, m)).join(" | ");
  }

  // Object / resource-union / resourceRef payloads require an explicit `on Target`
  // (no silent strip of `EditorialModule: Hero | Tabs` onto member projectors).
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
  projected: Set<string>,
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
  arm: ProjectionArmBody,
  variant: string,
  sourcePayload: TypeExpr,
  fieldPath: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: Set<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: Map<string, ResourceProjection>,
  resourceTag?: string
): { typeName: string; source: string } {
  const typeName = projectionVariantTypeName(queryName, projection.resource, variant);
  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown resource '${projection.resource}' in query '${queryName}'`
    );
  }

  const payloadFields = fieldMapFromPayload(sourcePayload, resource.payload, resources);
  const expansionContext: ExpansionAliasContext = {
    sourcePayload,
    projectionsByResource,
  };

  const lines: string[] = [];
  if (resourceTag !== undefined) {
    lines.push(`  ${resourceTag}: ${JSON.stringify(projection.resource)};`);
  }

  const effectiveFields = resolveSelectedFields(
    arm.selectedFields,
    arm.expansions,
    arm.include ?? projection.include,
    sourcePayload,
    resources,
    arm.excludedFields
  );

  for (const fieldName of effectiveFields) {
    const field = payloadFields.get(fieldName);
    if (!field) {
      throw new Error(
        `emitProjectionTypes: selected field '${fieldName}' is not on narrowed payload of '${projection.resource}' arm '${variant}'`
      );
    }
    const path = `${fieldPath}.selectedFields.${fieldName}`;
    const resolved = resolveForEmit(field.type, path, scalars, resources);
    lines.push(`  ${fieldName}: ${printTypeExpr(resolved)};`);
  }

  for (const expansion of arm.expansions) {
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
  arm: ProjectionArm,
  armIndex: number,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: Set<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: Map<string, ResourceProjection>,
  resourceTag?: string
): { typeName: string; source: string } {
  const disc = projectionArmDiscriminant(arm.when, projection.binding);
  const variant = disc ?? `Arm${armIndex}`;

  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown resource '${projection.resource}' in query '${queryName}'`
    );
  }

  const narrowed =
    narrowPayloadByFilter(resource.payloadType, arm.when, projection.binding, resources) ??
    resource.payloadType;

  return emitArmBodyVariantType(
    queryName,
    projection,
    arm,
    variant,
    narrowed,
    `queries.${queryName}.projections.${projection.binding}.arms.${armIndex}`,
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
  projection: ResourceProjection,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: Set<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: Map<string, ResourceProjection>,
  resourceTag?: string
): { typeName: string; source: string } {
  const defaultArm = projection.defaultArm;
  if (defaultArm === null) {
    throw new Error("emitProjectionTypes: emitDefaultArmVariantType called without defaultArm");
  }
  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown resource '${projection.resource}' in query '${queryName}'`
    );
  }
  return emitArmBodyVariantType(
    queryName,
    projection,
    defaultArm,
    "Default",
    resource.payloadType,
    `queries.${queryName}.projections.${projection.binding}.defaultArm`,
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
  projection: ResourceProjection,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: Set<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: Map<string, ResourceProjection>,
  resourceTag?: string
): string {
  const arms = projection.arms;
  if (arms === null) {
    throw new Error("emitProjectionTypes: emitArmedResourceProjectionTypes called without arms");
  }
  if (projection.defaultArm === null) {
    throw new Error(
      `emitProjectionTypes: armed 'on ${projection.resource}' missing defaultArm in query '${queryName}'`
    );
  }

  const variants: string[] = [];
  const parts: string[] = [];

  for (let i = 0; i < arms.length; i++) {
    const { typeName, source } = emitArmVariantType(
      queryName,
      projection,
      arms[i]!,
      i,
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
    projection,
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
  projection: ResourceProjection,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: Set<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: Map<string, ResourceProjection>,
  resourceTag?: string
): string {
  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown resource '${projection.resource}' in query '${queryName}'`
    );
  }
  if (resource.payloadType.kind !== "object") {
    throw new Error(
      `emitProjectionTypes: cannot project non-object payload of '${projection.resource}' in query '${queryName}'`
    );
  }

  const typeName = projectionTypeName(queryName, projection.resource);
  const lines: string[] = [];
  if (resourceTag !== undefined) {
    lines.push(`  ${resourceTag}: ${JSON.stringify(projection.resource)};`);
  }
  const expansionContext: ExpansionAliasContext = {
    sourcePayload: resource.payloadType,
    projectionsByResource,
  };

  const effectiveFields = resolveSelectedFields(
    projection.selectedFields,
    projection.expansions,
    projection.include,
    resource.payloadType,
    resources,
    projection.excludedFields
  );

  for (const fieldName of effectiveFields) {
    const field = resource.payload.get(fieldName);
    if (!field) {
      throw new Error(
        `emitProjectionTypes: selected field '${fieldName}' is not on payload of '${projection.resource}'`
      );
    }
    const path = `queries.${queryName}.projections.${projection.binding}.selectedFields.${fieldName}`;
    const resolved = resolveForEmit(field.type, path, scalars, resources);
    lines.push(`  ${fieldName}: ${printTypeExpr(resolved)};`);
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
  projection: ResourceProjection,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: Set<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: Map<string, ResourceProjection>,
  resourceTag?: string
): string {
  if (projection.arms !== null) {
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
  query: QueryDefinition,
  scalars: ScalarTable,
  resources: ResourceTable,
  resourceTag?: string
): string {
  const projectable = projectableProjections(query);
  const projected = new Set(projectable.map((p) => p.resource));
  const resolveTargets = resolveTargetIndex(query);
  const projectionsByResource = new Map(projectable.map((p) => [p.resource, p]));
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
export function emitProjectionTypes(program: Program, resourceTag?: string): string {
  if (program.queries.length === 0) {
    return "";
  }

  const { scalars, resources } = tablesFromProgram(program);
  return program.queries
    .map((query) => emitQueryProjectionTypes(query, scalars, resources, resourceTag))
    .join("\n\n");
}
