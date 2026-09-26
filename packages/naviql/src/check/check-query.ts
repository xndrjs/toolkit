import type {
  ExpandArm,
  Expansion,
  Expr,
  ProjectionArm,
  QueryDefinition,
  QueryRoot,
  ResolveArm,
  SourceSpan,
  TypeExpr,
} from "../ir";
import { checkConstruction } from "./construction";
import type { DiagnosticSink } from "./diagnostic";
import { formatType } from "./assignability";
import { inferExprType } from "./expressions";
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
      checkResolveArmExhaustiveness(
        resource.payloadType,
        projection.resolveArms,
        projection.binding,
        projPath,
        projection.span,
        resources,
        sink
      );
    } else if (projection.arms !== null) {
      for (let i = 0; i < projection.arms.length; i++) {
        checkProjectionArm(
          projection.arms[i]!,
          `${projPath}.arms.${i}`,
          projection.binding,
          projection.resource,
          resource.payloadType,
          scope,
          scalars,
          resources,
          sink
        );
      }
      checkProjectionArmExhaustiveness(
        resource.payloadType,
        projection.arms,
        projection.binding,
        projPath,
        projection.span,
        resources,
        sink
      );
    } else {
      checkSelectedFields(
        projection.selectedFields,
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
      path: `${path}.roots`,
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
  const bodyScope: QueryScope = {
    ...scope,
    payloadNarrowing: new Map([...scope.payloadNarrowing, [binding, narrowed]]),
  };

  checkSelectedFields(
    arm.selectedFields,
    narrowed,
    resourceName,
    armPath,
    arm.span,
    resources,
    sink
  );
  checkExpansions(arm.expansions, armPath, bodyScope, scalars, resources, sink);
}

function checkSelectedFields(
  selectedFields: string[],
  payloadType: TypeExpr,
  resourceName: string,
  basePath: string,
  span: SourceSpan | null,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  for (const fieldName of selectedFields) {
    if (!payloadHasField(payloadType, fieldName, resources)) {
      const unwrapped = unwrapNullable(payloadType);
      if (
        unwrapped.kind !== "object" &&
        unwrapped.kind !== "union" &&
        unwrapped.kind !== "resourceRef"
      ) {
        sink.push({
          code: "UNKNOWN_SELECTED_FIELD",
          message: `Cannot select field '${fieldName}' on non-object payload of '${resourceName}'`,
          path: `${basePath}.selectedFields.${fieldName}`,
          span,
        });
      } else {
        sink.push({
          code: "UNKNOWN_SELECTED_FIELD",
          message: `Selected field '${fieldName}' is not on payload of '${resourceName}'`,
          path: `${basePath}.selectedFields.${fieldName}`,
          span,
        });
      }
    }
  }
}

function checkExpansions(
  expansions: Expansion[],
  basePath: string,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const aliases = new Set<string>();
  for (const expansion of expansions) {
    const expPath = `${basePath}.expansions.${expansion.alias}`;
    if (aliases.has(expansion.alias)) {
      sink.push({
        code: "DUPLICATE_EXPANSION_ALIAS",
        message: `Duplicate expansion alias '${expansion.alias}'`,
        path: expPath,
        span: expansion.span,
      });
      continue;
    }
    aliases.add(expansion.alias);

    if (expansion.multiplicity === "many") {
      checkManyExpansion(expansion, expPath, scope, scalars, resources, sink);
    } else {
      if (expansion.comprehension !== null) {
        sink.push({
          code: "INVALID_COMPREHENSION",
          message: `Expansion '${expansion.alias}' has multiplicity "one" but includes a comprehension`,
          path: expPath,
          span: expansion.span,
        });
      }
      if (expansion.target === null) {
        sink.push({
          code: "INVALID_COMPREHENSION",
          message: `Expansion '${expansion.alias}' has multiplicity "one" but no target`,
          path: expPath,
          span: expansion.span,
        });
        continue;
      }
      checkConstruction(expansion.target, expPath, scope, scalars, resources, sink);
    }
  }
}

function checkManyExpansion(
  expansion: Expansion,
  expPath: string,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const comprehension = expansion.comprehension;
  if (!comprehension) {
    sink.push({
      code: "INVALID_COMPREHENSION",
      message: `Expansion '${expansion.alias}' has multiplicity "many" but no comprehension`,
      path: expPath,
      span: expansion.span,
    });
    return;
  }

  if (comprehension.arms.length === 0) {
    sink.push({
      code: "INVALID_COMPREHENSION",
      message: `Expansion '${expansion.alias}' each-comprehension has no arms`,
      path: expPath,
      span: expansion.span,
    });
    return;
  }

  const sourceType = inferExprType(
    comprehension.source,
    `${expPath}.source`,
    scope,
    resources,
    sink
  );
  if (!sourceType) {
    return;
  }

  const unwrapped = unwrapNullable(sourceType);
  if (unwrapped.kind !== "array") {
    sink.push({
      code: "COMPREHENSION_SOURCE_NOT_ARRAY",
      message: `Comprehension source must be an array, got ${formatType(sourceType)}`,
      path: `${expPath}.source`,
      span: comprehension.source.span,
    });
    return;
  }

  const elementType = unwrapped.of;

  for (let i = 0; i < comprehension.arms.length; i++) {
    checkExpandArm(
      comprehension.arms[i]!,
      `${expPath}.arms.${i}`,
      comprehension.itemBinding,
      elementType,
      scope,
      scalars,
      resources,
      sink
    );
  }

  checkArmExhaustiveness(
    elementType,
    comprehension.arms,
    comprehension.itemBinding,
    expPath,
    expansion.span,
    sink
  );
}

function checkExpandArm(
  arm: ExpandArm,
  armPath: string,
  itemBinding: string,
  elementType: TypeExpr,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  let itemType = elementType;
  if (arm.when) {
    const whenScope: QueryScope = {
      ...scope,
      items: new Map([[itemBinding, elementType]]),
    };
    const whenType = inferExprType(arm.when, `${armPath}.when`, whenScope, resources, sink);
    if (whenType) {
      const prim = unwrapNullable(whenType);
      if (prim.kind !== "primitive" || prim.name !== "boolean") {
        sink.push({
          code: "TYPE_MISMATCH",
          message: `Arm when-clause must be boolean, got ${formatType(whenType)}`,
          path: `${armPath}.when`,
          span: arm.when.span,
        });
      }
    }
    const narrowed = narrowItemTypeByFilter(elementType, arm.when, itemBinding);
    if (narrowed) {
      itemType = narrowed;
    }
  }

  const bodyScope: QueryScope = {
    ...scope,
    items: new Map([[itemBinding, itemType]]),
  };
  checkConstruction(arm.target, armPath, bodyScope, scalars, resources, sink);
}

/**
 * Closed union of objects with `type: "Lit"` discriminants must be covered by
 * at least one `when item.type == "Lit"` arm.
 */
function checkArmExhaustiveness(
  elementType: TypeExpr,
  arms: ExpandArm[],
  itemBinding: string,
  expPath: string,
  span: SourceSpan | null,
  sink: DiagnosticSink
): void {
  const required = closedTypeDiscriminants(elementType);
  if (required === null || required.size === 0) {
    return;
  }

  const covered = new Set<string>();
  for (const arm of arms) {
    if (arm.when?.kind !== "binary") continue;
    const disc = itemDiscriminantLiteral(arm.when, itemBinding);
    if (disc && arm.when.op === "==") {
      covered.add(disc.value);
    }
  }

  const missing = [...required].filter((v) => !covered.has(v)).sort();
  if (missing.length > 0) {
    sink.push({
      code: "INEXHAUSTIVE_EXPAND_ARMS",
      message: `each-expand arms do not cover discriminant(s): ${missing.map((v) => JSON.stringify(v)).join(", ")}`,
      path: expPath,
      span,
    });
  }
}

/**
 * Closed discriminant union on a resource payload must be covered by projection
 * `when binding.type == "Lit"` arms.
 */
function checkProjectionArmExhaustiveness(
  payloadType: TypeExpr,
  arms: ProjectionArm[],
  binding: string,
  projPath: string,
  span: SourceSpan | null,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const required = closedPayloadDiscriminants(payloadType, resources);
  if (required === null || required.size === 0) {
    return;
  }

  const covered = new Set<string>();
  for (const arm of arms) {
    if (arm.when.kind !== "binary") continue;
    const disc = payloadDiscriminantLiteral(arm.when, binding);
    if (disc && arm.when.op === "==") {
      covered.add(disc.value);
    }
  }

  const missing = [...required].filter((v) => !covered.has(v)).sort();
  if (missing.length > 0) {
    sink.push({
      code: "INEXHAUSTIVE_PROJECTION_ARMS",
      message: `projection when-arms do not cover discriminant(s): ${missing.map((v) => JSON.stringify(v)).join(", ")}`,
      path: projPath,
      span,
    });
  }
}

/**
 * Same closed-discriminant spirit as projection arms: decode payload object
 * unions with `type: "Lit"` must be covered by resolve `when` filters.
 */
function checkResolveArmExhaustiveness(
  payloadType: TypeExpr,
  arms: ResolveArm[],
  binding: string,
  projPath: string,
  span: SourceSpan | null,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const required = closedPayloadDiscriminants(payloadType, resources);
  if (required === null || required.size === 0) {
    return;
  }

  const covered = new Set<string>();
  for (const arm of arms) {
    if (arm.when?.kind !== "binary") continue;
    const disc = payloadDiscriminantLiteral(arm.when, binding);
    if (disc && arm.when.op === "==") {
      covered.add(disc.value);
    }
  }

  const missing = [...required].filter((v) => !covered.has(v)).sort();
  if (missing.length > 0) {
    sink.push({
      code: "INEXHAUSTIVE_RESOLVE_ARMS",
      message: `resolve when-arms do not cover discriminant(s): ${missing.map((v) => JSON.stringify(v)).join(", ")}`,
      path: projPath,
      span,
    });
  }
}

/** Returns the set of `type` literal values when element is a closed disc. union; else null. */
function closedTypeDiscriminants(elementType: TypeExpr): Set<string> | null {
  const members =
    elementType.kind === "union"
      ? elementType.members
      : elementType.kind === "object"
        ? [elementType]
        : null;
  if (!members || members.length === 0) return null;

  const values = new Set<string>();
  for (const member of members) {
    if (member.kind !== "object") return null;
    const typeField = member.fields.find((f) => f.name === "type");
    if (!typeField || typeField.type.kind !== "stringLiteral") return null;
    values.add(typeField.type.value);
  }
  return values;
}

/**
 * Closed `type` discriminants on a resource payload, expanding `resourceRef`
 * members to their object payloads when possible.
 */
function closedPayloadDiscriminants(
  payloadType: TypeExpr,
  resources: ResourceTable
): Set<string> | null {
  const members = expandPayloadObjectMembers(payloadType, resources);
  if (members === null || members.length === 0) return null;

  const values = new Set<string>();
  for (const member of members) {
    const typeField = member.fields.find((f) => f.name === "type");
    if (!typeField || typeField.type.kind !== "stringLiteral") return null;
    values.add(typeField.type.value);
  }
  return values;
}

/**
 * Expand a payload type to object members (following resourceRefs). Returns
 * `null` when the shape is not a closed object / object-union.
 */
function expandPayloadObjectMembers(
  payloadType: TypeExpr,
  resources: ResourceTable
): Extract<TypeExpr, { kind: "object" }>[] | null {
  const unwrapped = unwrapNullable(payloadType);
  if (unwrapped.kind === "object") {
    return [unwrapped];
  }
  if (unwrapped.kind === "resourceRef") {
    const inner = resources.get(unwrapped.name);
    if (!inner) return null;
    return expandPayloadObjectMembers(inner.payloadType, resources);
  }
  if (unwrapped.kind === "union") {
    const objects: Extract<TypeExpr, { kind: "object" }>[] = [];
    for (const member of unwrapped.members) {
      const expanded = expandPayloadObjectMembers(member, resources);
      if (expanded === null) return null;
      objects.push(...expanded);
    }
    return objects;
  }
  return null;
}

function payloadHasField(
  payloadType: TypeExpr,
  fieldName: string,
  resources: ResourceTable
): boolean {
  const unwrapped = unwrapNullable(payloadType);
  if (unwrapped.kind === "object") {
    return unwrapped.fields.some((f) => f.name === fieldName);
  }
  if (unwrapped.kind === "resourceRef") {
    const inner = resources.get(unwrapped.name);
    if (!inner) return false;
    return payloadHasField(inner.payloadType, fieldName, resources);
  }
  if (unwrapped.kind === "union") {
    return unwrapped.members.every((member) => payloadHasField(member, fieldName, resources));
  }
  return false;
}

/**
 * If `filter` is `item.type == "Lit"` (or `!=`) against a union of objects that
 * carry a `type` stringLiteral discriminant, return the matching member(s).
 */
function narrowItemTypeByFilter(
  elementType: TypeExpr,
  filter: Expr,
  itemBinding: string
): TypeExpr | undefined {
  if (filter.kind !== "binary" || (filter.op !== "==" && filter.op !== "!=")) {
    return undefined;
  }

  const disc = itemDiscriminantLiteral(filter, itemBinding);
  if (!disc) return undefined;

  const members =
    elementType.kind === "union"
      ? elementType.members
      : elementType.kind === "object"
        ? [elementType]
        : null;
  if (!members) return undefined;

  const matched = members.filter((member) => {
    if (member.kind !== "object") return false;
    const typeField = member.fields.find((f) => f.name === "type");
    if (!typeField || typeField.type.kind !== "stringLiteral") return false;
    const eq = typeField.type.value === disc.value;
    return filter.op === "==" ? eq : !eq;
  });

  if (matched.length === 0) return undefined;
  if (matched.length === 1) return matched[0];
  return { kind: "union", members: matched, span: null };
}

/**
 * Narrow a resource payload via `binding.type == "Lit"` (or `!=`), expanding
 * resourceRef union members to their object payloads.
 */
function narrowPayloadByFilter(
  payloadType: TypeExpr,
  filter: Expr,
  binding: string,
  resources: ResourceTable
): TypeExpr | undefined {
  if (filter.kind !== "binary" || (filter.op !== "==" && filter.op !== "!=")) {
    return undefined;
  }

  const disc = payloadDiscriminantLiteral(filter, binding);
  if (!disc) return undefined;

  const members = expandPayloadObjectMembers(payloadType, resources);
  if (!members) return undefined;

  const matched = members.filter((member) => {
    const typeField = member.fields.find((f) => f.name === "type");
    if (!typeField || typeField.type.kind !== "stringLiteral") return false;
    const eq = typeField.type.value === disc.value;
    return filter.op === "==" ? eq : !eq;
  });

  if (matched.length === 0) return undefined;
  if (matched.length === 1) return matched[0];
  return { kind: "union", members: matched, span: null };
}

function itemDiscriminantLiteral(
  filter: Expr & { kind: "binary" },
  itemBinding: string
): { value: string } | undefined {
  return discriminantLiteral(filter, {
    kind: "itemRef",
    binding: itemBinding,
  });
}

function payloadDiscriminantLiteral(
  filter: Expr & { kind: "binary" },
  binding: string
): { value: string } | undefined {
  return discriminantLiteral(filter, {
    kind: "payloadRef",
    binding,
  });
}

function discriminantLiteral(
  filter: Expr & { kind: "binary" },
  expected: { kind: "itemRef" | "payloadRef"; binding: string }
): { value: string } | undefined {
  const sides: { left: Expr; right: Expr }[] = [
    { left: filter.left, right: filter.right },
    { left: filter.right, right: filter.left },
  ];
  for (const { left, right } of sides) {
    if (
      left.kind === expected.kind &&
      left.binding === expected.binding &&
      left.path.length === 1 &&
      left.path[0] === "type" &&
      right.kind === "literal" &&
      typeof right.value === "string"
    ) {
      return { value: right.value };
    }
  }
  return undefined;
}
