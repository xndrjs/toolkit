/**
 * Validate top-level `datasource` declarations:
 * routes, context fields, `when` predicates, structural resource coverage,
 * aggregate execution-context merge, and query-context compatibility.
 *
 * Coverage / aggregate / query-context rules apply only when
 * `program.datasources.length > 0` (hand-wired apps stay valid).
 *
 * Query context must cover the merge of datasources whose routes intersect
 * resources referenced by that query (not the global aggregate).
 */
import type {
  DatasourceDefinition,
  Expansion,
  Expr,
  FieldDecl,
  Program,
  QueryDefinition,
  ResourceProjection,
} from "../ir";
import { resolvedQueryContext } from "../ir";
import { formatType, isAssignable, typesSemanticallyEqual } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import { inferExprType } from "./expressions";
import { checkNoOpaqueInType, opaqueTypeBanMessage } from "./opaque-validation";
import {
  checkTypeExpr,
  checkUniqueFields,
  concreteType,
  unwrapNullable,
  type FieldMap,
  type OpaqueTable,
  type QueryScope,
  type ResourceTable,
  type ScalarTable,
} from "./symbols";

export function checkDatasources(
  program: Program,
  scalars: ScalarTable,
  resources: ResourceTable,
  opaques: OpaqueTable,
  sink: DiagnosticSink,
  options: { requireDatasourceCoverage?: boolean } = {}
): void {
  if (program.datasources.length === 0) {
    return;
  }

  const requireDatasourceCoverage = options.requireDatasourceCoverage ?? true;

  const names = new Set<string>();
  /** Merged execution-context fields across all datasources (first wins for span). */
  const aggregate: FieldMap = new Map();
  /** Resources that appear in ≥1 route. */
  const covered = new Set<string>();

  for (const ds of program.datasources) {
    const path = `datasources.${ds.name}`;
    if (names.has(ds.name)) {
      sink.push({
        code: "DUPLICATE_DATASOURCE",
        message: `Duplicate datasource '${ds.name}'`,
        path,
        span: ds.span,
      });
      continue;
    }
    names.add(ds.name);
    checkDatasource(ds, path, scalars, resources, opaques, aggregate, covered, sink);
  }

  if (requireDatasourceCoverage) {
    for (const resourceName of resources.keys()) {
      if (!covered.has(resourceName)) {
        sink.push({
          code: "RESOURCE_MISSING_DATASOURCE",
          message: `Resource '${resourceName}' has no datasource route`,
          path: `resources.${resourceName}`,
          span: null,
        });
      }
    }
  }

  checkQueryContextsAgainstUsedDatasources(program, scalars, resources, opaques, sink);
}

/**
 * Resources mentioned by a query: roots, islands, projection resources,
 * expand / resolve construction targets. Fragment spreads are already inlined
 * into projections at lower.
 */
export function queryReferencedResources(query: QueryDefinition): Set<string> {
  const out = new Set<string>();

  for (const root of query.roots) {
    out.add(root.construction.resource);
  }
  for (const island of query.islands) {
    out.add(island.resource);
  }
  for (const projection of query.projections) {
    collectProjectionResources(projection, out);
  }

  return out;
}

function collectProjectionResources(projection: ResourceProjection, out: Set<string>): void {
  out.add(projection.resource);

  for (const expansion of projection.expansions) {
    collectExpansionResources(expansion, out);
  }
  if (projection.arms) {
    for (const arm of projection.arms) {
      for (const expansion of arm.expansions) {
        collectExpansionResources(expansion, out);
      }
    }
  }
  if (projection.defaultArm) {
    for (const expansion of projection.defaultArm.expansions) {
      collectExpansionResources(expansion, out);
    }
  }
  if (projection.resolveArms) {
    for (const arm of projection.resolveArms) {
      out.add(arm.target.resource);
    }
  }
  if (projection.resolveEach) {
    for (const arm of projection.resolveEach.arms) {
      out.add(arm.target.resource);
    }
  }
}

function collectExpansionResources(expansion: Expansion, out: Set<string>): void {
  if (expansion.target) {
    out.add(expansion.target.resource);
  }
  if (expansion.comprehension) {
    for (const arm of expansion.comprehension.arms) {
      out.add(arm.target.resource);
    }
  }
}

/** Datasources with at least one route resource in `referenced`. */
function usedDatasources(
  program: Program,
  referenced: ReadonlySet<string>
): DatasourceDefinition[] {
  return program.datasources.filter((ds) =>
    ds.routes.some((route) => referenced.has(route.resource))
  );
}

/**
 * First-wins merge of context fields from `datasources` (program order).
 * Also records which datasource names first contributed each field
 * (and later DS that also declare it, for diagnostics).
 */
function mergeUsedContextFields(datasources: readonly DatasourceDefinition[]): {
  fields: FieldMap;
  requiredBy: Map<string, string[]>;
} {
  const fields: FieldMap = new Map();
  const requiredBy = new Map<string, string[]>();

  for (const ds of datasources) {
    for (const field of ds.contextFields) {
      const sources = requiredBy.get(field.name);
      if (sources) {
        sources.push(ds.name);
      } else {
        requiredBy.set(field.name, [ds.name]);
      }
      if (!fields.has(field.name)) {
        fields.set(field.name, field);
      }
    }
  }

  return { fields, requiredBy };
}

/**
 * Datasource execution-context fields required by a query: merge of context
 * fields from datasources whose routes intersect resources the query references.
 */
export function requiredQueryContextFields(
  program: Program,
  query: QueryDefinition
): {
  fields: FieldMap;
  requiredBy: Map<string, string[]>;
} {
  const referenced = queryReferencedResources(query);
  const used = usedDatasources(program, referenced);
  return mergeUsedContextFields(used);
}

function formatDatasourceList(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `datasource '${names[0]}'`;
  if (names.length === 2) {
    return `datasources '${names[0]}' and '${names[1]}'`;
  }
  const head = names
    .slice(0, -1)
    .map((n) => `'${n}'`)
    .join(", ");
  return `datasources ${head}, and '${names[names.length - 1]}'`;
}

function checkDatasource(
  ds: DatasourceDefinition,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  opaques: OpaqueTable,
  aggregate: FieldMap,
  covered: Set<string>,
  sink: DiagnosticSink
): void {
  const context = checkUniqueFields(
    ds.contextFields,
    `${path}.context`,
    "DUPLICATE_DATASOURCE_CONTEXT_FIELD",
    "datasource context",
    sink
  );

  for (const field of ds.contextFields) {
    const fieldPath = `${path}.context.${field.name}`;
    checkTypeExpr(field.type, fieldPath, scalars, resources, opaques, sink);
    const concrete = concreteType(field.type, fieldPath, scalars, resources, opaques, sink);
    if (concrete) {
      checkNoOpaqueInType(
        concrete,
        fieldPath,
        "OPAQUE_TYPE_NOT_ALLOWED_IN_DATASOURCE_CONTEXT",
        opaqueTypeBanMessage(concrete, "datasource context"),
        sink,
        field.span
      );
    }
    mergeAggregateField(field, fieldPath, aggregate, scalars, resources, opaques, sink);
  }

  const routeResources = new Set<string>();
  for (let i = 0; i < ds.routes.length; i++) {
    const route = ds.routes[i]!;
    const routePath = `${path}.routes.${i}`;
    const knownResource = resources.has(route.resource);

    if (!knownResource) {
      sink.push({
        code: "UNKNOWN_DATASOURCE_RESOURCE",
        message: `Unknown resource '${route.resource}' in datasource '${ds.name}'`,
        path: routePath,
        span: route.span,
      });
    } else if (routeResources.has(route.resource)) {
      sink.push({
        code: "DUPLICATE_DATASOURCE_ROUTE",
        message: `Duplicate route for resource '${route.resource}' in datasource '${ds.name}'`,
        path: routePath,
        span: route.span,
      });
    } else {
      routeResources.add(route.resource);
      covered.add(route.resource);
    }

    if (route.when !== null && route.alias == null) {
      sink.push({
        code: "DATASOURCE_WHEN_REQUIRES_BINDING",
        message: `Datasource route 'for ${route.resource}' requires a binding when a when-clause is present`,
        path: routePath,
        span: route.span,
      });
      continue;
    }

    if (!knownResource || route.when === null || route.alias == null) {
      continue;
    }

    checkDatasourceWhen(
      route.when,
      `${routePath}.when`,
      route.alias,
      route.resource,
      context,
      scalars,
      resources,
      sink
    );
  }
}

function mergeAggregateField(
  field: FieldDecl,
  path: string,
  aggregate: FieldMap,
  scalars: ScalarTable,
  resources: ResourceTable,
  opaques: OpaqueTable,
  sink: DiagnosticSink
): void {
  const existing = aggregate.get(field.name);
  if (!existing) {
    aggregate.set(field.name, field);
    return;
  }

  const a = concreteType(existing.type, path, scalars, resources, opaques, sink);
  const b = concreteType(field.type, path, scalars, resources, opaques, sink);
  if (!a || !b) return;

  if (!typesSemanticallyEqual(a, b)) {
    sink.push({
      code: "INCOMPATIBLE_EXECUTION_CONTEXT_FIELD",
      message: `Execution context field '${field.name}' has incompatible types across datasources (${formatType(a)} vs ${formatType(b)})`,
      path,
      span: field.span,
    });
  }
}

function checkDatasourceWhen(
  when: Expr,
  path: string,
  alias: string,
  resource: string,
  context: FieldMap,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  if (rejectDatasourceWhenExprs(when, path, sink)) {
    return;
  }

  const scope: QueryScope = {
    path,
    params: new Map(),
    context,
    allowContext: true,
    bindings: new Map([[alias, resource]]),
    items: new Map(),
    payloadNarrowing: new Map(),
  };

  const whenType = inferExprType(when, path, scope, resources, sink, scalars);
  if (!whenType) return;

  const prim = unwrapNullable(whenType);
  if (prim.kind !== "primitive" || prim.name !== "boolean") {
    sink.push({
      code: "TYPE_MISMATCH",
      message: `Datasource when-clause must be boolean, got ${formatType(whenType)}`,
      path,
      span: when.span,
    });
  }
}

/**
 * Reject payload / param / item refs in datasource `when`.
 * Returns true when any such diagnostic was emitted (skip normal inference).
 */
function rejectDatasourceWhenExprs(expr: Expr, path: string, sink: DiagnosticSink): boolean {
  let rejected = false;

  const visit = (node: Expr): void => {
    switch (node.kind) {
      case "payloadRef": {
        const access = [node.binding, ...node.path].join(".");
        sink.push({
          code: "DATASOURCE_PAYLOAD_ACCESS",
          message: `Datasource predicates run before resource loading. Payload access \`${access}\` is not available here; use identity fields through \`@${node.binding}\`.`,
          path,
          span: node.span,
        });
        rejected = true;
        return;
      }
      case "param":
        sink.push({
          code: "DATASOURCE_INVALID_EXPR",
          message: `Datasource when-clause cannot reference parameter '${node.name}'`,
          path,
          span: node.span,
        });
        rejected = true;
        return;
      case "itemRef":
        sink.push({
          code: "DATASOURCE_INVALID_EXPR",
          message: `Datasource when-clause cannot reference comprehension item '${node.binding}'`,
          path,
          span: node.span,
        });
        rejected = true;
        return;
      case "unary":
        visit(node.operand);
        return;
      case "cast":
        visit(node.operand);
        return;
      case "binary":
        visit(node.left);
        visit(node.right);
        return;
      case "arrayLiteral":
        for (const el of node.elements) visit(el);
        return;
      case "literal":
      case "context":
      case "identityRef":
        return;
    }
  };

  visit(expr);
  return rejected;
}

/**
 * Each query context projection must cover fields from datasources whose routes
 * intersect resources referenced by that query (types assignable).
 * Extra projection entries (not required by any used datasource) are warnings.
 */
function checkQueryContextsAgainstUsedDatasources(
  program: Program,
  scalars: ScalarTable,
  resources: ResourceTable,
  opaques: OpaqueTable,
  sink: DiagnosticSink
): void {
  for (const query of program.queries) {
    const { fields: required, requiredBy } = requiredQueryContextFields(program, query);
    const queryContext = new Map(resolvedQueryContext(query).map((f) => [f.name, f]));

    for (const [name, reqField] of required) {
      const queryField = queryContext.get(name);
      const fieldPath = `queries.${query.name}.context.${name}`;
      const via = formatDatasourceList(requiredBy.get(name) ?? []);

      if (!queryField) {
        sink.push({
          code: "QUERY_CONTEXT_MISSING_DATASOURCE_FIELD",
          message: `Query '${query.name}' context is missing datasource execution-context field '${name}' (required by ${via})`,
          path: fieldPath,
          span: query.span,
          data: { contextField: name },
        });
        continue;
      }

      const expected = concreteType(reqField.type, fieldPath, scalars, resources, opaques, sink);
      const actual = concreteType(queryField.type, fieldPath, scalars, resources, opaques, sink);
      if (!expected || !actual) continue;

      if (!isAssignable(actual, expected)) {
        sink.push({
          code: "QUERY_CONTEXT_MISSING_DATASOURCE_FIELD",
          message: `Query '${query.name}' context field '${name}' has type ${formatType(actual)}, incompatible with datasource execution context ${formatType(expected)} (required by ${via})`,
          path: fieldPath,
          span: queryField.span,
          data: { contextField: name },
        });
      }
    }

    for (const proj of query.contextProjections) {
      if (required.has(proj.contextName)) continue;
      sink.push({
        code: "QUERY_CONTEXT_UNUSED_FIELD",
        severity: "warning",
        message: `Query '${query.name}' context field '${proj.contextName}' is not required by any datasource used by this query`,
        path: `queries.${query.name}.context.${proj.contextName}`,
        span: proj.span,
        data: { contextField: proj.contextName },
      });
    }
  }
}
