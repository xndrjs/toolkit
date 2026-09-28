import type {
  ProjectionArm,
  ProjectionArmBody,
  QueryDefinition,
  QueryRoot,
  ResolveArm,
  SourceSpan,
  TypeExpr,
} from "../ir";
import { checkExpansions, checkSelectedFields } from "./check-expansions";
import { checkIslands } from "./check-islands";
import { checkRequiredOn } from "./check-required-on";
import { checkConstruction } from "./construction";
import type { DiagnosticSink } from "./diagnostic";
import { formatType } from "./assignability";
import { narrowPayloadByFilter } from "./discriminants";
import { inferExprType } from "./expressions";
import { checkExcludedFields, resolveSelectedFields } from "./projection-include";
import {
  checkTypeExpr,
  checkUniqueFields,
  unwrapNullable,
  type QueryScope,
  type ResourceTable,
  type ScalarTable,
} from "./symbols";

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

  checkIslands(query.islands, path, scope, resources, sink);
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
    const whenType = inferExprType(arm.when, `${armPath}.when`, scope, resources, sink);
    if (whenType) {
      const prim = unwrapNullable(whenType);
      if (prim.kind !== "primitive" || prim.name !== "boolean") {
        sink.push({
          code: "RESOLVE_WHEN",
          message: `Resolve when-clause must be boolean, got ${formatType(whenType)}`,
          path: `${armPath}.when`,
          span: arm.when.span,
        });
      }
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
  const whenType = inferExprType(arm.when, `${armPath}.when`, scope, resources, sink);
  if (whenType) {
    const prim = unwrapNullable(whenType);
    if (prim.kind !== "primitive" || prim.name !== "boolean") {
      sink.push({
        code: "TYPE_MISMATCH",
        message: `Projection when-clause must be boolean, got ${formatType(whenType)}`,
        path: `${armPath}.when`,
        span: arm.when.span,
      });
    }
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
