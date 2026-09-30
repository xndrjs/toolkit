import type {
  Expansion,
  ProjectionArm,
  ProjectionArmBody,
  QueryDefinition,
  QueryRoot,
  ResolveArm,
  ResourceProjection,
  SourceSpan,
  TypeExpr,
} from "../ir";
import {
  checkExpansions,
  checkNonObjectProjectionBody,
  checkSelectedFields,
} from "./check-expansions";
import { checkIslands } from "./check-islands";
import { checkRequiredOn } from "./check-required-on";
import { checkConstruction } from "./construction";
import type { DiagnosticSink } from "./diagnostic";
import { formatType } from "./assignability";
import { isObjectLikePayload, narrowPayloadByFilter } from "./discriminants";
import { exprsEqual, inferPayloadWhenExprType, isBooleanWhenType } from "./expressions";
import { checkExcludedFields, resolveSelectedFields } from "./projection-include";
import {
  checkTypeExpr,
  checkUniqueFields,
  type QueryScope,
  type ResourceTable,
  type ScalarTable,
} from "./symbols";

/** Role of a name in the query-local binding namespaces. */
type QueryBindingRole = "parameter" | "projection binding" | "island binding" | "each item binding";

/**
 * After fragment rebind, query-local names collide as follows:
 * - **Expression namespace:** params ∪ `on` bindings ∪ `each` item bindings
 * - **Island namespace:** island bindings ∪ params (island `when` can see params;
 *   reuse of an `on` / `each` name is fine — different scopes)
 *
 * Collisions → `QUERY_BINDING_NAME_CLASH` (distinct from `DUPLICATE_PARAM` /
 * `DUPLICATE_BINDING`).
 */
function checkQueryBindingNameClash(
  query: QueryDefinition,
  path: string,
  sink: DiagnosticSink
): void {
  const expressionNames = new Map<string, QueryBindingRole>();
  const islandNames = new Map<string, QueryBindingRole>();
  /** Params only — shared by both namespaces for island↔param checks. */
  const parameters = new Set<string>();

  const pushClash = (
    name: string,
    existing: QueryBindingRole,
    role: QueryBindingRole,
    claimPath: string,
    span: SourceSpan | null
  ): void => {
    const message =
      existing === role
        ? `Name '${name}' is used as ${role} more than once in query '${query.name}'`
        : `Name '${name}' is used as both ${existing} and ${role} in query '${query.name}'`;
    sink.push({
      code: "QUERY_BINDING_NAME_CLASH",
      message,
      path: claimPath,
      span,
    });
  };

  const claimExpression = (
    name: string,
    role: Exclude<QueryBindingRole, "island binding">,
    claimPath: string,
    span: SourceSpan | null
  ): void => {
    const existing = expressionNames.get(name);
    if (existing !== undefined) {
      pushClash(name, existing, role, claimPath, span);
      return;
    }
    expressionNames.set(name, role);
  };

  for (const field of query.parameters) {
    parameters.add(field.name);
    claimExpression(field.name, "parameter", `${path}.parameters.${field.name}`, field.span);
  }

  for (let i = 0; i < query.projections.length; i++) {
    const projection = query.projections[i]!;
    claimExpression(
      projection.binding,
      "projection binding",
      `${path}.projections.${projection.binding || i}`,
      projection.span
    );
  }

  for (const projection of query.projections) {
    for (const expansion of expansionsForBindingClash(projection)) {
      if (expansion.comprehension === null) continue;
      claimExpression(
        expansion.comprehension.itemBinding,
        "each item binding",
        `${path}.projections.${projection.binding}.expansions.${expansion.alias}`,
        expansion.span
      );
    }
  }

  for (let i = 0; i < query.islands.length; i++) {
    const island = query.islands[i]!;
    if (island.binding === null) continue;
    const name = island.binding;
    const claimPath = `${path}.islands.${i}`;
    if (parameters.has(name)) {
      pushClash(name, "parameter", "island binding", claimPath, island.span);
      continue;
    }
    const existingIsland = islandNames.get(name);
    if (existingIsland !== undefined) {
      pushClash(name, existingIsland, "island binding", claimPath, island.span);
      continue;
    }
    islandNames.set(name, "island binding");
  }
}

/** Flat body, when-arms, and default arm expansions (resolve-only → none). */
function expansionsForBindingClash(projection: ResourceProjection): Expansion[] {
  if (projection.resolveArms !== null) {
    return [];
  }
  if (projection.arms !== null) {
    const fromArms = projection.arms.flatMap((arm) => arm.expansions);
    const fromDefault = projection.defaultArm?.expansions ?? [];
    return [...fromArms, ...fromDefault];
  }
  return projection.expansions;
}

export function checkQuery(
  query: QueryDefinition,
  path: string,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  if (!query.contextDeclared) {
    sink.push({
      code: "MISSING_CONTEXT",
      message: `Query '${query.name}' must declare a context block`,
      path,
      span: query.span,
    });
  }

  const params = checkUniqueFields(
    query.parameters,
    `${path}.parameters`,
    "DUPLICATE_PARAM",
    "parameter",
    sink
  );
  const context = checkUniqueFields(
    query.context,
    `${path}.context`,
    "DUPLICATE_CONTEXT_FIELD",
    "context",
    sink
  );

  for (const field of query.parameters) {
    checkTypeExpr(field.type, `${path}.parameters.${field.name}`, scalars, resources, sink);
  }
  for (const field of query.context) {
    checkTypeExpr(field.type, `${path}.context.${field.name}`, scalars, resources, sink);
  }

  const bindings = new Map<string, string>();
  for (let i = 0; i < query.projections.length; i++) {
    const projection = query.projections[i]!;
    const projPath = `${path}.projections.${projection.binding || i}`;
    if (bindings.has(projection.binding)) {
      sink.push({
        code: "DUPLICATE_BINDING",
        message: `Duplicate projection binding '${projection.binding}' in query '${query.name}'`,
        path: projPath,
        span: projection.span,
      });
      continue;
    }
    if (!resources.has(projection.resource)) {
      sink.push({
        code: "UNKNOWN_RESOURCE",
        message: `Unknown resource '${projection.resource}' in projection`,
        path: projPath,
        span: projection.span,
      });
    }
    bindings.set(projection.binding, projection.resource);
  }

  checkQueryBindingNameClash(query, path, sink);

  const scope: QueryScope = {
    path,
    params,
    context,
    bindings,
    items: new Map(),
    payloadNarrowing: new Map(),
  };

  checkQueryRoots(query.roots, path, query.span, scope, scalars, resources, sink);

  for (const projection of query.projections) {
    const projPath = `${path}.projections.${projection.binding}`;
    const resource = resources.get(projection.resource);
    if (!resource) {
      continue;
    }

    // IR invariant only: source preamble+when is distributed into arms at lower,
    // so root selectedFields/expansions are empty. Reject hand-built IR that
    // still sets both a flat root body and when-arms.
    const hasFlatBody = projection.selectedFields.length > 0 || projection.expansions.length > 0;
    if (projection.arms !== null && hasFlatBody) {
      sink.push({
        code: "MIXED_PROJECTION_BODY",
        message: `Projection 'on ${projection.resource}' IR cannot keep root fields/expansions alongside when-arms (preamble must be distributed at lower)`,
        path: projPath,
        span: projection.span,
      });
    }

    // Resolve-only clauses cannot also carry projection body / when-arms
    // (parse rejects the mix; this catches hand-built IR).
    if (projection.resolveArms !== null && (hasFlatBody || projection.arms !== null)) {
      sink.push({
        code: "MIXED_RESOLVE_PROJECTION",
        message: `Projection 'on ${projection.resource}' cannot mix 'resolve to' with selected fields, expansions, or when-arms`,
        path: projPath,
        span: projection.span,
      });
    }

    if (projection.resolveArms !== null && projection.include !== null) {
      sink.push({
        code: "INCLUDE_ON_RESOLVE",
        message: `Projection 'on ${projection.resource}' cannot use 'include' with 'resolve to'`,
        path: projPath,
        span: projection.span,
      });
    }

    if (projection.resolveArms !== null) {
      for (let i = 0; i < projection.resolveArms.length; i++) {
        checkResolveArm(
          projection.resolveArms[i]!,
          `${projPath}.resolveArms.${i}`,
          projection.binding,
          resource.payloadType,
          scope,
          scalars,
          resources,
          sink
        );
      }
    } else if (projection.arms !== null) {
      if (!isObjectLikePayload(resource.payloadType, resources)) {
        sink.push({
          code: "ARMED_ON_NON_OBJECT",
          message: `Cannot use when-arms on non-object payload of '${projection.resource}'`,
          path: projPath,
          span: projection.span,
        });
      } else {
        if (projection.arms.length === 0) {
          sink.push({
            code: "EMPTY_PROJECTION_ARMS",
            message: `Projection 'on ${projection.resource}' has an empty when-arm list`,
            path: projPath,
            span: projection.span,
          });
        } else if (projection.defaultArm === null) {
          sink.push({
            code: "MISSING_PROJECTION_DEFAULT",
            message: `Projection 'on ${projection.resource}' with when-arms must include a default arm`,
            path: projPath,
            span: projection.span,
          });
        }

        for (let i = 0; i < projection.arms.length; i++) {
          checkProjectionArm(
            projection.arms[i]!,
            `${projPath}.arms.${i}`,
            projection.binding,
            projection.resource,
            projection.include,
            resource.payloadType,
            scope,
            scalars,
            resources,
            sink
          );
        }

        for (let i = 0; i < projection.arms.length; i++) {
          for (let j = 0; j < i; j++) {
            if (exprsEqual(projection.arms[i]!.when, projection.arms[j]!.when)) {
              sink.push({
                code: "DUPLICATE_PROJECTION_WHEN",
                message:
                  `Projection 'on ${projection.resource}' when-arm ${i} has the same condition ` +
                  `as when-arm ${j} (unreachable / zombie arm)`,
                path: `${projPath}.arms.${i}.when`,
                span: projection.arms[i]!.when.span ?? projection.arms[i]!.span,
              });
              break;
            }
          }
        }

        if (projection.defaultArm !== null) {
          checkProjectionArmBody(
            projection.defaultArm,
            `${projPath}.defaultArm`,
            projection.binding,
            projection.resource,
            projection.include,
            resource.payloadType,
            scope,
            scalars,
            resources,
            sink
          );
        }
      }
    } else {
      if (projection.defaultArm !== null) {
        sink.push({
          code: "UNEXPECTED_PROJECTION_DEFAULT",
          message: `Projection 'on ${projection.resource}' cannot use 'default' without when-arms`,
          path: `${projPath}.defaultArm`,
          span: projection.defaultArm.span ?? projection.span,
        });
      }
      checkExcludedFields(
        projection.excludedFields,
        projection.selectedFields,
        projection.expansions,
        resource.payloadType,
        resources,
        projPath,
        projection.span,
        sink
      );
      if (!isObjectLikePayload(resource.payloadType, resources)) {
        checkNonObjectProjectionBody(
          projection.resource,
          resource.payloadType,
          projection.selectedFields,
          projection.expansions,
          projection.include,
          projPath,
          projection.span,
          resources,
          sink
        );
      } else {
        const effectiveFields = resolveSelectedFields(
          projection.selectedFields,
          projection.expansions,
          projection.include,
          resource.payloadType,
          resources,
          projection.excludedFields
        );
        checkSelectedFields(
          effectiveFields,
          resource.payloadType,
          projection.resource,
          projPath,
          projection.span,
          resources,
          sink
        );
        checkExpansions(projection.expansions, projPath, scope, scalars, resources, sink);
      }
    }
  }

  checkIslands(query.islands, path, scope, resources, sink, scalars);
  checkRequiredOn(query, path, resources, sink);
}

/**
 * Validate query seeds: non-empty `roots`, unique non-null aliases, and
 * construction checks per entry (same path as expand/resolve targets).
 */
function checkQueryRoots(
  roots: QueryRoot[],
  path: string,
  querySpan: SourceSpan | null,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  if (roots.length === 0) {
    sink.push({
      code: "EMPTY_ROOTS",
      message: "Query must declare at least one root",
      path,
      span: querySpan,
    });
    return;
  }

  const seenAliases = new Set<string>();
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i]!;
    const rootPath = root.alias === null ? `${path}.roots.${i}` : `${path}.roots.${root.alias}`;

    if (root.alias !== null) {
      if (seenAliases.has(root.alias)) {
        sink.push({
          code: "DUPLICATE_ROOT_ALIAS",
          message: `Duplicate root alias '${root.alias}'`,
          path: rootPath,
          span: root.span,
        });
      }
      seenAliases.add(root.alias);
    }

    checkConstruction(root.construction, rootPath, scope, scalars, resources, sink);
  }
}

/**
 * Resolve arm: construction under optional `when` on the decode payload
 * (narrowed like projection arms). No selected fields / expands here.
 */
function checkResolveArm(
  arm: ResolveArm,
  armPath: string,
  binding: string,
  payloadType: TypeExpr,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  let bodyScope = scope;
  if (arm.when) {
    const whenType = inferPayloadWhenExprType(
      arm.when,
      `${armPath}.when`,
      binding,
      payloadType,
      scope,
      resources,
      sink,
      scalars
    );
    if (whenType && !isBooleanWhenType(whenType)) {
      sink.push({
        code: "RESOLVE_WHEN",
        message: `Resolve when-clause must be boolean, got ${formatType(whenType)}`,
        path: `${armPath}.when`,
        span: arm.when.span,
      });
    }
    const narrowed =
      narrowPayloadByFilter(payloadType, arm.when, binding, resources) ?? payloadType;
    bodyScope = {
      ...scope,
      payloadNarrowing: new Map([...scope.payloadNarrowing, [binding, narrowed]]),
    };
  }

  checkConstruction(arm.target, armPath, bodyScope, scalars, resources, sink);
}

function checkProjectionArm(
  arm: ProjectionArm,
  armPath: string,
  binding: string,
  resourceName: string,
  include: "all" | "properties" | "none" | null,
  payloadType: TypeExpr,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const whenType = inferPayloadWhenExprType(
    arm.when,
    `${armPath}.when`,
    binding,
    payloadType,
    scope,
    resources,
    sink,
    scalars
  );
  if (whenType && !isBooleanWhenType(whenType)) {
    sink.push({
      code: "TYPE_MISMATCH",
      message: `Projection when-clause must be boolean, got ${formatType(whenType)}`,
      path: `${armPath}.when`,
      span: arm.when.span,
    });
  }

  const narrowed = narrowPayloadByFilter(payloadType, arm.when, binding, resources) ?? payloadType;
  checkProjectionArmBody(
    arm,
    armPath,
    binding,
    resourceName,
    include,
    narrowed,
    scope,
    scalars,
    resources,
    sink,
    true
  );
}

/** Check selected fields / expands for a when-arm or default body. */
function checkProjectionArmBody(
  arm: ProjectionArmBody,
  armPath: string,
  binding: string,
  resourceName: string,
  include: "all" | "properties" | "none" | null,
  payloadType: TypeExpr,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink,
  narrowedPayload = false
): void {
  const bodyScope: QueryScope = narrowedPayload
    ? {
        ...scope,
        payloadNarrowing: new Map([...scope.payloadNarrowing, [binding, payloadType]]),
      }
    : scope;

  const effectiveInclude = arm.include ?? include;
  checkExcludedFields(
    arm.excludedFields,
    arm.selectedFields,
    arm.expansions,
    payloadType,
    resources,
    armPath,
    arm.span,
    sink
  );

  if (!isObjectLikePayload(payloadType, resources)) {
    checkNonObjectProjectionBody(
      resourceName,
      payloadType,
      arm.selectedFields,
      arm.expansions,
      effectiveInclude,
      armPath,
      arm.span,
      resources,
      sink
    );
    return;
  }

  const effectiveFields = resolveSelectedFields(
    arm.selectedFields,
    arm.expansions,
    effectiveInclude,
    payloadType,
    resources,
    arm.excludedFields
  );
  checkSelectedFields(
    effectiveFields,
    payloadType,
    resourceName,
    armPath,
    arm.span,
    resources,
    sink
  );
  checkExpansions(arm.expansions, armPath, bodyScope, scalars, resources, sink);
}
