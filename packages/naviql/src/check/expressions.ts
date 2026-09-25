import type { Expr, TypeExpr } from "../ir";
import { formatType, isAssignable, literalInhabits } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import {
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
      const name =
        typeof expr.value === "string"
          ? "string"
          : typeof expr.value === "number"
            ? "number"
            : "boolean";
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
  if (expr.kind === "literal") {
    const ok = literalInhabits(expr.value, expected, (name) => scalars.get(name)?.representation);
    if (!ok) {
      sink.push({
        code: "TYPE_MISMATCH",
        message: `Literal is not assignable to ${formatType(expected)}`,
        path,
      });
    }
    return;
  }

  const actual = inferExprType(expr, path, scope, resources, sink);
  if (!actual) return;

  if (!isAssignable(actual, expected)) {
    sink.push({
      code: "TYPE_MISMATCH",
      message: `Type ${formatType(actual)} is not assignable to ${formatType(expected)}`,
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
