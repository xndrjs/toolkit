/**
 * Emit query-scoped projection TypeScript types from checked queries.
 *
 * Per single-root query `PostDetail`:
 * ```ts
 * export type PostDetail_User = { $type: "User"; … };
 * export type PostDetail_Post = { $type: "Post"; …; author: PostDetail_User };
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
 * export type PostDetail_Entry_Hero = { $type: "Entry"; type: "Hero"; … };
 * export type PostDetail_Entry_Page = { $type: "Entry"; id: EntryId };
 * export type PostDetail_Entry = PostDetail_Entry_Hero | PostDetail_Entry_Page;
 * ```
 *
 * Alias types restore expansion names. Union resources strip to the union of
 * projected member types; collection resources (`Tab[]`) become member arrays.
 * Resolve-only `on R resolve to` is not a projection type — strip aliases follow
 * resolve targets (e.g. `related: PageDetail_Entry | PageDetail_Asset`).
 */
import { createDiagnosticSink } from "../../../check/diagnostic";
import { resolveTypeExpr } from "../../../check/resolve-type";
import type { ResourceTable, ScalarTable } from "../../../check/symbols";
import type {
  Expansion,
  FieldDecl,
  Program,
  ProjectionArm,
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
import {
  projectableProjections,
  resolveTargetIndex,
  stripToConcreteMembers,
  type ResolveTargetIndex,
} from "./shared";

export type { ExpansionAliasContext } from "./refers-narrow";

function tablesFromProgram(program: Program): {
  scalars: ScalarTable;
  resources: ResourceTable;
} {
  const scalars: ScalarTable = new Map(program.scalars.map((s) => [s.name, s]));
  const resources: ResourceTable = new Map();
  for (const resource of program.resources) {
    const payloadFields = resource.payloadType.kind === "object" ? resource.payloadType.fields : [];
    resources.set(resource.name, {
      identity: new Map(resource.identity.fields.map((f) => [f.name, f])),
      payload: new Map(payloadFields.map((f) => [f.name, f])),
      payloadType: resource.payloadType,
    });
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

  const stripped = stripToConcreteMembers(targetName, resources, projected, resolveTargets);
  if (stripped !== null && stripped.length > 0) {
    for (const member of stripped) {
      requireProjected(queryName, member, projected, `resource-valued member of '${targetName}'`);
    }
    return stripped.map((m) => projectionTypeName(queryName, m)).join(" | ");
  }

  if (payload.kind === "object") {
    requireProjected(queryName, targetName, projected, `expansion target '${targetName}'`);
    return projectionTypeName(queryName, targetName);
  }

  throw new Error(
    `emitProjectionTypes: unsupported payload shape for expansion target '${targetName}' in query '${queryName}'`
  );
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
 * Object-payload member matching `binding.type == "Lit"`, expanding resourceRefs.
 */
function narrowPayloadObject(
  payloadType: TypeExpr,
  disc: string,
  resources: ResourceTable
): Extract<TypeExpr, { kind: "object" }> | null {
  const members = expandPayloadObjectMembers(payloadType, resources);
  if (members === null) return null;
  const matched = members.filter((member) => {
    const typeField = member.fields.find((f) => f.name === "type");
    return typeField?.type.kind === "stringLiteral" && typeField.type.value === disc;
  });
  return matched.length === 1 ? matched[0]! : null;
}

function expandPayloadObjectMembers(
  payloadType: TypeExpr,
  resources: ResourceTable
): Extract<TypeExpr, { kind: "object" }>[] | null {
  if (payloadType.kind === "object") {
    return [payloadType];
  }
  if (payloadType.kind === "resourceRef") {
    const inner = resources.get(payloadType.name);
    if (!inner) return null;
    return expandPayloadObjectMembers(inner.payloadType, resources);
  }
  if (payloadType.kind === "union") {
    const objects: Extract<TypeExpr, { kind: "object" }>[] = [];
    for (const member of payloadType.members) {
      const expanded = expandPayloadObjectMembers(member, resources);
      if (expanded === null) return null;
      objects.push(...expanded);
    }
    return objects;
  }
  if (payloadType.kind === "nullable") {
    return expandPayloadObjectMembers(payloadType.of, resources);
  }
  return null;
}

function fieldMap(fields: FieldDecl[]): Map<string, FieldDecl> {
  return new Map(fields.map((f) => [f.name, f]));
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
  projectionsByResource: Map<string, ResourceProjection>
): { typeName: string; source: string } {
  const disc = projectionArmDiscriminant(arm.when, projection.binding);
  const variant = disc ?? `Arm${armIndex}`;
  const typeName = projectionVariantTypeName(queryName, projection.resource, variant);

  const resource = resources.get(projection.resource);
  if (!resource) {
    throw new Error(
      `emitProjectionTypes: unknown resource '${projection.resource}' in query '${queryName}'`
    );
  }

  const narrowed =
    disc !== null ? narrowPayloadObject(resource.payloadType, disc, resources) : null;
  const payloadFields = narrowed !== null ? fieldMap(narrowed.fields) : resource.payload;
  const sourcePayload: TypeExpr = narrowed ?? resource.payloadType;
  const expansionContext: ExpansionAliasContext = {
    sourcePayload,
    projectionsByResource,
  };

  const lines: string[] = [`  $type: ${JSON.stringify(projection.resource)};`];

  for (const fieldName of arm.selectedFields) {
    const field = payloadFields.get(fieldName);
    if (!field) {
      throw new Error(
        `emitProjectionTypes: selected field '${fieldName}' is not on narrowed payload of '${projection.resource}' arm '${variant}'`
      );
    }
    const path = `queries.${queryName}.projections.${projection.binding}.arms.${armIndex}.selectedFields.${fieldName}`;
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
    source: `export type ${typeName} = {\n${lines.join("\n")}\n};`,
  };
}

function emitArmedResourceProjectionTypes(
  queryName: string,
  projection: ResourceProjection,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: Set<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: Map<string, ResourceProjection>
): string {
  const arms = projection.arms;
  if (arms === null) {
    throw new Error("emitProjectionTypes: emitArmedResourceProjectionTypes called without arms");
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
      projectionsByResource
    );
    variants.push(typeName);
    parts.push(source);
  }

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
  projectionsByResource: Map<string, ResourceProjection>
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
  const lines: string[] = [`  $type: ${JSON.stringify(projection.resource)};`];
  const expansionContext: ExpansionAliasContext = {
    sourcePayload: resource.payloadType,
    projectionsByResource,
  };

  for (const fieldName of projection.selectedFields) {
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

  return `export type ${typeName} = {\n${lines.join("\n")}\n};`;
}

function emitResourceProjectionType(
  queryName: string,
  projection: ResourceProjection,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: Set<string>,
  resolveTargets: ResolveTargetIndex,
  projectionsByResource: Map<string, ResourceProjection>
): string {
  if (projection.arms !== null) {
    return emitArmedResourceProjectionTypes(
      queryName,
      projection,
      scalars,
      resources,
      projected,
      resolveTargets,
      projectionsByResource
    );
  }
  return emitFlatResourceProjectionType(
    queryName,
    projection,
    scalars,
    resources,
    projected,
    resolveTargets,
    projectionsByResource
  );
}

function emitQueryProjectionTypes(
  query: QueryDefinition,
  scalars: ScalarTable,
  resources: ResourceTable
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
        projectionsByResource
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
 */
export function emitProjectionTypes(program: Program): string {
  if (program.queries.length === 0) {
    return "";
  }

  const { scalars, resources } = tablesFromProgram(program);
  return program.queries
    .map((query) => emitQueryProjectionTypes(query, scalars, resources))
    .join("\n\n");
}
