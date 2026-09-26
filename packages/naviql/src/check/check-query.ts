import type { ExpandArm, Expansion, Expr, QueryDefinition, SourceSpan, TypeExpr } from "../ir";
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
  };

  checkConstruction(query.root, `${path}.root`, scope, scalars, resources, sink);

  for (const projection of query.projections) {
    const projPath = `${path}.projections.${projection.binding}`;
    const resource = resources.get(projection.resource);
    if (!resource) {
      continue;
    }

    for (const fieldName of projection.selectedFields) {
      if (resource.payloadType.kind !== "object") {
        sink.push({
          code: "UNKNOWN_SELECTED_FIELD",
          message: `Cannot select field '${fieldName}' on non-object payload of '${projection.resource}'`,
          path: `${projPath}.selectedFields.${fieldName}`,
          span: projection.span,
        });
      } else if (!resource.payload.has(fieldName)) {
        sink.push({
          code: "UNKNOWN_SELECTED_FIELD",
          message: `Selected field '${fieldName}' is not on payload of '${projection.resource}'`,
          path: `${projPath}.selectedFields.${fieldName}`,
          span: projection.span,
        });
      }
    }

    const aliases = new Set<string>();
    for (const expansion of projection.expansions) {
      const expPath = `${projPath}.expansions.${expansion.alias}`;
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
    const disc = discriminantLiteral(arm.when, itemBinding);
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

  const disc = discriminantLiteral(filter, itemBinding);
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

function discriminantLiteral(
  filter: Expr & { kind: "binary" },
  itemBinding: string
): { value: string } | undefined {
  const sides: { left: Expr; right: Expr }[] = [
    { left: filter.left, right: filter.right },
    { left: filter.right, right: filter.left },
  ];
  for (const { left, right } of sides) {
    if (
      left.kind === "itemRef" &&
      left.binding === itemBinding &&
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
