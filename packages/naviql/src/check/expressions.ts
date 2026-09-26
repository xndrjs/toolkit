import type { Expr, TypeExpr } from "../ir";
import { formatType, isAssignable, literalInhabits } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import { resolveBindingPath, resolvePathOnFields, resolvePathOnItemType } from "./expr-paths";
import { concreteType, type QueryScope, type ResourceTable, type ScalarTable } from "./symbols";

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
          span: expr.span,
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
        expr.span,
        sink
      );
    }
    case "payloadRef": {
      return resolveBindingPath(
        expr.binding,
        expr.path,
        "payload",
        path,
        expr.span,
        scope,
        resources,
        sink
      );
    }
    case "identityRef": {
      return resolveBindingPath(
        expr.binding,
        expr.path,
        "identity",
        path,
        expr.span,
        scope,
        resources,
        sink
      );
    }
    case "itemRef": {
      const itemType = scope.items.get(expr.binding);
      if (!itemType) {
        sink.push({
          code: "UNKNOWN_ITEM_BINDING",
          message: `Unknown comprehension item '${expr.binding}'`,
          path,
          span: expr.span,
        });
        return undefined;
      }
      if (expr.path.length === 0) {
        return itemType;
      }
      return resolvePathOnItemType(expr.path, itemType, path, expr.span, sink);
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
        span: expr.span,
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
      span: expr.span,
    });
  }
}
