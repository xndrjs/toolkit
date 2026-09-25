import type { Expansion, Expr, QueryDefinition, TypeExpr } from "../ir";
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
      });
      continue;
    }
    if (!resources.has(projection.resource)) {
      sink.push({
        code: "UNKNOWN_RESOURCE",
        message: `Unknown resource '${projection.resource}' in projection`,
        path: projPath,
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
        });
      } else if (!resource.payload.has(fieldName)) {
        sink.push({
          code: "UNKNOWN_SELECTED_FIELD",
          message: `Selected field '${fieldName}' is not on payload of '${projection.resource}'`,
          path: `${projPath}.selectedFields.${fieldName}`,
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
          });
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
    });
    checkConstruction(expansion.target, expPath, scope, scalars, resources, sink);
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
    });
    return;
  }

  let itemType = unwrapped.of;
  if (comprehension.filter) {
    const narrowed = narrowItemTypeByFilter(
      itemType,
      comprehension.filter,
      comprehension.itemBinding
    );
    const filterScope: QueryScope = {
      ...scope,
      items: new Map([[comprehension.itemBinding, unwrapped.of]]),
    };
    const filterType = inferExprType(
      comprehension.filter,
      `${expPath}.filter`,
      filterScope,
      resources,
      sink
    );
    if (filterType) {
      const prim = unwrapNullable(filterType);
      if (prim.kind !== "primitive" || prim.name !== "boolean") {
        sink.push({
          code: "TYPE_MISMATCH",
          message: `Comprehension filter must be boolean, got ${formatType(filterType)}`,
          path: `${expPath}.filter`,
        });
      }
    }
    if (narrowed) {
      itemType = narrowed;
    }
  }

  const bodyScope: QueryScope = {
    ...scope,
    items: new Map([[comprehension.itemBinding, itemType]]),
  };
  checkConstruction(expansion.target, expPath, bodyScope, scalars, resources, sink);
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
