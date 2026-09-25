import type { Expr, TypeExpr } from "../ir";
import { formatType, isAssignable, literalInhabits } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import {
  concreteType,
  unwrapNullable,
  type FieldMap,
  type QueryScope,
  type ResourceTable,
  type ScalarTable,
} from "./symbols";

/**
 * Infer the type of an expression. Returns `undefined` when already diagnosed
 * as invalid (unknown binding/path/etc.). Literals are treated as primitives
 * for orphan resolution; assignability uses `literalInhabits` instead.
 */
export function inferExprType(
  expr: Expr,
  path: string,
  scope: QueryScope,
  resources: ResourceTable,
  sink: DiagnosticSink
): TypeExpr | undefined {
  switch (expr.kind) {
    case "literal": {
      if (expr.value === null) {
        return {
          kind: "nullable",
          of: { kind: "primitive", name: "string", span: null },
          span: null,
        };
      }
      if (typeof expr.value === "string") {
        // Prefer stringLiteral so filters can narrow unions via `s.type == "Hero"`.
        return { kind: "stringLiteral", value: expr.value, span: null };
      }
      const name = typeof expr.value === "number" ? "number" : "boolean";
      return { kind: "primitive", name, span: null };
    }
    case "param": {
      const field = scope.params.get(expr.name);
      if (!field) {
        sink.push({
          code: "UNKNOWN_PARAM",
          message: `Unknown parameter '${expr.name}'`,
          path,
        });
        return undefined;
      }
      return field.type;
    }
    case "context": {
      return resolvePathOnFields(
        expr.path,
        scope.context,
        path,
        "UNKNOWN_CONTEXT_PATH",
        "context",
        sink
      );
    }
    case "payloadRef": {
      return resolveBindingPath(expr.binding, expr.path, "payload", path, scope, resources, sink);
    }
    case "identityRef": {
      return resolveBindingPath(expr.binding, expr.path, "identity", path, scope, resources, sink);
    }
    case "itemRef": {
      const itemType = scope.items.get(expr.binding);
      if (!itemType) {
        sink.push({
          code: "UNKNOWN_ITEM_BINDING",
          message: `Unknown comprehension item '${expr.binding}'`,
          path,
        });
        return undefined;
      }
      if (expr.path.length === 0) {
        return itemType;
      }
      return resolvePathOnItemType(expr.path, itemType, path, sink);
    }
    case "binary": {
      const left = inferExprType(expr.left, `${path}.left`, scope, resources, sink);
      const right = inferExprType(expr.right, `${path}.right`, scope, resources, sink);
      if (!left || !right) return undefined;
      // Equality is always boolean; assignability of operands is not required
      // (discriminant filters compare stringLiteral to stringLiteral / scalar).
      return { kind: "primitive", name: "boolean", span: null };
    }
  }
}

export function checkExprAssignableTo(
  expr: Expr,
  expected: TypeExpr,
  path: string,
  scope: QueryScope,
  scalars: ScalarTable,
  resources: ResourceTable,
  sink: DiagnosticSink
): void {
  const expectedConcrete = concreteType(expected, path, scalars, resources, sink);
  if (!expectedConcrete) return;

  if (expr.kind === "literal") {
    const ok = literalInhabits(
      expr.value,
      expectedConcrete,
      (name) => scalars.get(name)?.representation
    );
    if (!ok) {
      sink.push({
        code: "TYPE_MISMATCH",
        message: `Literal is not assignable to ${formatType(expectedConcrete)}`,
        path,
      });
    }
    return;
  }

  const actual = inferExprType(expr, path, scope, resources, sink);
  if (!actual) return;

  const actualConcrete = concreteType(actual, path, scalars, resources, sink);
  if (!actualConcrete) return;

  if (!isAssignable(actualConcrete, expectedConcrete)) {
    sink.push({
      code: "TYPE_MISMATCH",
      message: `Type ${formatType(actualConcrete)} is not assignable to ${formatType(expectedConcrete)}`,
      path,
    });
  }
}

function resolveBindingPath(
  binding: string,
  pathSegments: string[],
  side: "payload" | "identity",
  path: string,
  scope: QueryScope,
  resources: ResourceTable,
  sink: DiagnosticSink
): TypeExpr | undefined {
  const resourceName = scope.bindings.get(binding);
  if (!resourceName) {
    sink.push({
      code: "UNKNOWN_BINDING",
      message: `Unknown binding '${binding}'`,
      path,
    });
    return undefined;
  }
  const resource = resources.get(resourceName);
  if (!resource) {
    return undefined;
  }
  const fields = side === "payload" ? resource.payload : resource.identity;
  const code = side === "payload" ? "UNKNOWN_PAYLOAD_PATH" : "UNKNOWN_IDENTITY_PATH";
  return resolvePathOnFields(pathSegments, fields, path, code, side, sink);
}

function resolvePathOnFields(
  pathSegments: string[],
  rootFields: FieldMap,
  diagPath: string,
  code: string,
  label: string,
  sink: DiagnosticSink
): TypeExpr | undefined {
  if (pathSegments.length === 0) {
    sink.push({
      code,
      message: `Empty ${label} path`,
      path: diagPath,
    });
    return undefined;
  }

  let fields: FieldMap | null = rootFields;
  let currentType: TypeExpr | undefined;

  for (let i = 0; i < pathSegments.length; i++) {
    const segment = pathSegments[i]!;
    if (!fields) {
      sink.push({
        code,
        message: `Cannot access '${segment}' on non-object ${label} type${currentType ? ` ${formatType(currentType)}` : ""}`,
        path: diagPath,
      });
      return undefined;
    }
    const field = fields.get(segment);
    if (!field) {
      sink.push({
        code,
        message: `Unknown ${label} path '${pathSegments.slice(0, i + 1).join(".")}'`,
        path: diagPath,
      });
      return undefined;
    }
    currentType = field.type;
    if (i < pathSegments.length - 1) {
      const inner = unwrapNullable(currentType);
      if (inner.kind === "object") {
        fields = new Map(inner.fields.map((f) => [f.name, f]));
      } else {
        fields = null;
      }
    }
  }

  return currentType;
}

/**
 * Resolve a path on an item type, including unions of objects that share the
 * field (discriminated stubs: `{ type: "Hero", id: HeroId } | …`).
 */
function resolvePathOnItemType(
  pathSegments: string[],
  itemType: TypeExpr,
  diagPath: string,
  sink: DiagnosticSink
): TypeExpr | undefined {
  const inner = unwrapNullable(itemType);
  if (inner.kind === "object") {
    return resolvePathOnFields(
      pathSegments,
      new Map(inner.fields.map((f) => [f.name, f])),
      diagPath,
      "UNKNOWN_ITEM_PATH",
      "item",
      sink
    );
  }

  if (inner.kind === "union") {
    const memberTypes: TypeExpr[] = [];
    for (const member of inner.members) {
      const resolved = resolvePathOnItemType(pathSegments, member, diagPath, sink);
      if (!resolved) {
        return undefined;
      }
      memberTypes.push(resolved);
    }
    // Collapse identical types; otherwise keep a union (e.g. HeroId | TabsId | ProductId).
    const unique: TypeExpr[] = [];
    for (const t of memberTypes) {
      if (!unique.some((u) => formatType(u) === formatType(t))) {
        unique.push(t);
      }
    }
    if (unique.length === 1) return unique[0];
    return { kind: "union", members: unique, span: null };
  }

  sink.push({
    code: "UNKNOWN_ITEM_PATH",
    message: `Cannot access path on non-object item type ${formatType(itemType)}`,
    path: diagPath,
  });
  return undefined;
}
