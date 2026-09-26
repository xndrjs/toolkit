/**
 * Emit query-scoped projection TypeScript types from checked queries.
 *
 * Per query `PostDetail`:
 * ```ts
 * export type PostDetail_User = { $type: "User"; … };
 * export type PostDetail_Post = { $type: "Post"; …; author: PostDetail_User };
 * export type PostDetailResult = PostDetail_Post;
 * ```
 *
 * Alias types restore expansion names. Union resources strip to the union of
 * projected member types; collection resources (`Tab[]`) become member arrays.
 */
import { createDiagnosticSink } from "../../../check/diagnostic";
import { resolveTypeExpr } from "../../../check/resolve-type";
import type { ResourceTable, ScalarTable } from "../../../check/symbols";
import type {
  Expansion,
  Program,
  QueryDefinition,
  ResourceProjection,
  TypeExpr,
} from "../../../ir";
import { printTypeExpr } from "./emit-types";
import { projectionTypeName, queryResultTypeName } from "../naming";

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

function resourceRefsFromPayload(payload: TypeExpr): string[] | null {
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

/**
 * Concrete object-payload resource names to expose when expanding `targetName`.
 * Follows resource-valued payloads (`CustomReference → Entry → Hero | Tabs | …`).
 * Returns `null` for ordinary object payloads (project as `targetName` itself).
 */
function stripToConcreteMembers(
  targetName: string,
  resources: ResourceTable,
  seen = new Set<string>()
): string[] | null {
  if (seen.has(targetName)) {
    return null;
  }
  seen.add(targetName);

  const target = resources.get(targetName);
  if (!target) {
    return null;
  }

  const payload = target.payloadType;
  if (payload.kind === "object") {
    return null;
  }
  if (payload.kind === "array") {
    return null;
  }

  const refs = resourceRefsFromPayload(payload);
  if (refs === null || refs.length === 0) {
    return null;
  }

  const members: string[] = [];
  for (const ref of refs) {
    const nested = stripToConcreteMembers(ref, resources, new Set(seen));
    if (nested === null) {
      members.push(ref);
    } else {
      members.push(...nested);
    }
  }
  return [...new Set(members)];
}

/**
 * TypeScript type string for an expansion alias under `queryName`.
 * - ordinary resource → `Query_Resource`
 * - union resource → `Query_A | Query_B | …` (member projections)
 * - collection (`R[]`) → `Query_R[]`
 * - `many` / multi-arm → union of arm targets, wrapped in an array
 */
export function printExpansionAliasType(
  queryName: string,
  expansion: Expansion,
  resources: ResourceTable,
  projected: Set<string>
): string {
  if (expansion.multiplicity === "many" && expansion.comprehension !== null) {
    const armTypes = expansion.comprehension.arms.map((arm) =>
      printTargetAliasType(queryName, arm.target.resource, resources, projected)
    );
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

  const base = printTargetAliasType(queryName, expansion.target.resource, resources, projected);
  return base;
}

function printTargetAliasType(
  queryName: string,
  targetName: string,
  resources: ResourceTable,
  projected: Set<string>
): string {
  const target = resources.get(targetName);
  if (!target) {
    throw new Error(
      `emitProjectionTypes: unknown expansion target '${targetName}' in query '${queryName}'`
    );
  }

  const payload = target.payloadType;

  if (payload.kind === "array" && payload.of.kind === "resourceRef") {
    const element = payload.of.name;
    requireProjected(queryName, element, projected, `collection element of '${targetName}'`);
    return `${projectionTypeName(queryName, element)}[]`;
  }

  const stripped = stripToConcreteMembers(targetName, resources);
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

function emitResourceProjectionType(
  queryName: string,
  projection: ResourceProjection,
  scalars: ScalarTable,
  resources: ResourceTable,
  projected: Set<string>
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
    const aliasType = printExpansionAliasType(queryName, expansion, resources, projected);
    lines.push(`  ${expansion.alias}: ${aliasType};`);
  }

  return `export type ${typeName} = {\n${lines.join("\n")}\n};`;
}

function emitQueryProjectionTypes(
  query: QueryDefinition,
  scalars: ScalarTable,
  resources: ResourceTable
): string {
  const projected = new Set(query.projections.map((p) => p.resource));
  const parts: string[] = [];

  for (const projection of query.projections) {
    parts.push(emitResourceProjectionType(query.name, projection, scalars, resources, projected));
  }

  const rootResource = query.root.resource;
  if (!projected.has(rootResource)) {
    throw new Error(
      `emitProjectionTypes: query '${query.name}' root is '${rootResource}' but has no matching projection`
    );
  }

  parts.push(
    `export type ${queryResultTypeName(query.name)} = ${projectionTypeName(query.name, rootResource)};`
  );

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
