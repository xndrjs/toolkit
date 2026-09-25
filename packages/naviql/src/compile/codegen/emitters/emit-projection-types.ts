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
 * TypeScript type string for an expansion alias under `queryName`.
 * - ordinary resource → `Query_Resource`
 * - union resource → `Query_A | Query_B | …` (member projections)
 * - collection (`R[]`) → `Query_R[]`
 * - `many` wraps the above in an array (parenthesizing unions)
 */
export function printExpansionAliasType(
  queryName: string,
  expansion: Expansion,
  resources: ResourceTable,
  projected: Set<string>
): string {
  const targetName = expansion.target.resource;
  const target = resources.get(targetName);
  if (!target) {
    throw new Error(
      `emitProjectionTypes: unknown expansion target '${targetName}' in query '${queryName}'`
    );
  }

  const payload = target.payloadType;
  let base: string;

  if (payload.kind === "array" && payload.of.kind === "resourceRef") {
    const element = payload.of.name;
    requireProjected(queryName, element, projected, `collection element of '${targetName}'`);
    base = `${projectionTypeName(queryName, element)}[]`;
  } else {
    const unionMembers = resourceRefsFromPayload(payload);
    if (unionMembers !== null && (payload.kind === "union" || unionMembers.length > 1)) {
      // Union resource (EditorialModule: Tabs | Hero | Product) — strip to members.
      for (const member of unionMembers) {
        requireProjected(queryName, member, projected, `union member of '${targetName}'`);
      }
      base = unionMembers.map((m) => projectionTypeName(queryName, m)).join(" | ");
    } else if (payload.kind === "object" || (unionMembers !== null && unionMembers.length === 1)) {
      // Concrete object resource (or degenerate single resourceRef payload).
      const concrete = payload.kind === "object" ? targetName : unionMembers![0]!;
      requireProjected(queryName, concrete, projected, `expansion target '${targetName}'`);
      base = projectionTypeName(queryName, concrete);
    } else {
      throw new Error(
        `emitProjectionTypes: unsupported payload shape for expansion target '${targetName}' in query '${queryName}'`
      );
    }
  }

  if (expansion.multiplicity === "many") {
    return base.includes("|") ? `(${base})[]` : `${base}[]`;
  }

  return base;
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
