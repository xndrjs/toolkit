/**
 * Validate top-level `datasource` declarations:
 * routes, context fields, `when` predicates, structural resource coverage,
 * aggregate execution-context merge, and query-context compatibility.
 *
 * Coverage / aggregate / query-context rules apply only when
 * `program.datasources.length > 0` (hand-wired apps stay valid).
 */
import type { DatasourceDefinition, Expr, FieldDecl, Program } from "../ir";
import { formatType, isAssignable, typesSemanticallyEqual } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import { inferExprType } from "./expressions";
import {
  checkTypeExpr,
  checkUniqueFields,
  concreteType,
  unwrapNullable,
  type FieldMap,
  type QueryScope,
  type ResourceTable,
  type ScalarTable,
} from "./symbols";

export function checkDatasources(
  program: Program,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  if (program.datasources.length === 0) {
    return;
  }

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
    checkDatasource(ds, path, scalars, resources, aggregate, covered, sink);
  }

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

  checkQueryContextsAgainstAggregate(program, aggregate, scalars, resources, sink);
}

function checkDatasource(
  ds: DatasourceDefinition,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
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
    checkTypeExpr(field.type, `${path}.context.${field.name}`, scalars, resources, sink);
    mergeAggregateField(
      field,
      `${path}.context.${field.name}`,
      aggregate,
      scalars,
      resources,
      sink
    );
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
  sink: DiagnosticSink
): void {
  const existing = aggregate.get(field.name);
  if (!existing) {
    aggregate.set(field.name, field);
    return;
  }

  const a = concreteType(existing.type, path, scalars, resources, sink);
  const b = concreteType(field.type, path, scalars, resources, sink);
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
    bindings: new Map([[alias, resource]]),
    items: new Map(),
    payloadNarrowing: new Map(),
  };

  const whenType = inferExprType(when, path, scope, resources, sink);
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

function checkQueryContextsAgainstAggregate(
  program: Program,
  aggregate: FieldMap,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  if (aggregate.size === 0) return;

  for (const query of program.queries) {
    const queryContext = new Map(query.context.map((f) => [f.name, f]));
    for (const [name, aggField] of aggregate) {
      const queryField = queryContext.get(name);
      const fieldPath = `queries.${query.name}.context.${name}`;

      if (!queryField) {
        sink.push({
          code: "QUERY_CONTEXT_MISSING_DATASOURCE_FIELD",
          message: `Query '${query.name}' context is missing datasource execution-context field '${name}'`,
          path: fieldPath,
          span: query.span,
        });
        continue;
      }

      const expected = concreteType(aggField.type, fieldPath, scalars, resources, sink);
      const actual = concreteType(queryField.type, fieldPath, scalars, resources, sink);
      if (!expected || !actual) continue;

      // Query context must satisfy the aggregate (`C extends ZielExecutionContext`).
      if (!isAssignable(actual, expected)) {
        sink.push({
          code: "QUERY_CONTEXT_MISSING_DATASOURCE_FIELD",
          message: `Query '${query.name}' context field '${name}' has type ${formatType(actual)}, incompatible with datasource execution context ${formatType(expected)}`,
          path: fieldPath,
          span: queryField.span,
        });
      }
    }
  }
}
