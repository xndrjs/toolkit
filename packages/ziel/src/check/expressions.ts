import type { Expr, PrimitiveTypeName, TypeExpr } from "../ir";
import { formatType, isAssignable, literalInhabits, typesSemanticallyEqual } from "./assignability";
import type { DiagnosticSink } from "./diagnostic";
import { narrowPayloadByFilter, type PayloadTypeLookup } from "./discriminants";
import { resolveBindingPath, resolvePathOnFields, resolvePathOnItemType } from "./expr-paths";
import {
  concreteType,
  unwrapNullable,
  type QueryScope,
  type ResourceTable,
  type ScalarTable,
} from "./symbols";

function pathsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === b[i]);
}

/**
 * Structural equality of expression trees, ignoring `span`.
 * Used for duplicate `when` detection (exact identity, no and/or reordering).
 */
export function exprsEqual(a: Expr, b: Expr): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "literal":
      return b.kind === "literal" && Object.is(a.value, b.value);
    case "param":
      return b.kind === "param" && a.name === b.name;
    case "context":
      return b.kind === "context" && pathsEqual(a.path, b.path);
    case "payloadRef":
      return b.kind === "payloadRef" && a.binding === b.binding && pathsEqual(a.path, b.path);
    case "identityRef":
      return b.kind === "identityRef" && a.binding === b.binding && pathsEqual(a.path, b.path);
    case "itemRef":
      return b.kind === "itemRef" && a.binding === b.binding && pathsEqual(a.path, b.path);
    case "arrayLiteral":
      return (
        b.kind === "arrayLiteral" &&
        a.elements.length === b.elements.length &&
        a.elements.every((el, i) => exprsEqual(el, b.elements[i]!))
      );
    case "unary":
      return b.kind === "unary" && a.op === b.op && exprsEqual(a.operand, b.operand);
    case "cast":
      return b.kind === "cast" && a.type === b.type && exprsEqual(a.operand, b.operand);
    case "binary":
      return (
        b.kind === "binary" &&
        a.op === b.op &&
        exprsEqual(a.left, b.left) &&
        exprsEqual(a.right, b.right)
      );
  }
}

function scalarRepresentation(name: string, scalars: ScalarTable): PrimitiveTypeName | undefined {
  return scalars.get(name)?.representation;
}

/**
 * Whether two operand types may be compared with `==` / `!=` / `in`.
 * Scalars stay nominal — use `as Primitive` to erase to representation.
 * String literals may inhabit a scalar / string on the other side (discriminant filters).
 */
export function comparisonCompatible(
  left: TypeExpr,
  right: TypeExpr,
  scalars: ScalarTable
): boolean {
  const a = unwrapNullable(left);
  const b = unwrapNullable(right);

  if (a.kind === "union") {
    return a.members.every((m) => comparisonCompatible(m, b, scalars));
  }
  if (b.kind === "union") {
    return b.members.every((m) => comparisonCompatible(a, m, scalars));
  }

  if (typesSemanticallyEqual(a, b)) return true;

  if (a.kind === "stringLiteral" && b.kind === "stringLiteral") return true;

  if (isAssignable(a, b) || isAssignable(b, a)) return true;

  const rep = (name: string) => scalarRepresentation(name, scalars);

  if (a.kind === "stringLiteral" && b.kind === "scalarRef") {
    return literalInhabits(a.value, b, rep);
  }
  if (b.kind === "stringLiteral" && a.kind === "scalarRef") {
    return literalInhabits(b.value, a, rep);
  }

  return false;
}

function canCastToPrimitive(
  operand: TypeExpr,
  target: PrimitiveTypeName,
  scalars: ScalarTable
): boolean {
  const t = unwrapNullable(operand);

  if (t.kind === "union") {
    return t.members.every((m) => canCastToPrimitive(m, target, scalars));
  }
  if (t.kind === "scalarRef") {
    return scalarRepresentation(t.name, scalars) === target;
  }
  if (t.kind === "primitive") {
    return t.name === target;
  }
  if (t.kind === "stringLiteral") {
    return target === "string";
  }
  return false;
}

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
  sink: DiagnosticSink,
  scalars: ScalarTable = new Map()
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
      if (!scope.allowContext) {
        sink.push({
          code: "CONTEXT_FORBIDDEN_IN_QUERY",
          message:
            "Query bodies cannot use `context.*`; reference the query parameter by name instead",
          path,
          span: expr.span,
        });
        return undefined;
      }
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
    case "arrayLiteral": {
      if (expr.elements.length === 0) {
        // Empty membership list — type as never[] (no element type).
        return {
          kind: "array",
          of: { kind: "primitive", name: "string", span: null },
          span: null,
        };
      }
      const first = inferExprType(
        expr.elements[0]!,
        `${path}.elements.0`,
        scope,
        resources,
        sink,
        scalars
      );
      if (!first) return undefined;
      for (let i = 1; i < expr.elements.length; i++) {
        const el = inferExprType(
          expr.elements[i]!,
          `${path}.elements.${i}`,
          scope,
          resources,
          sink,
          scalars
        );
        if (!el) return undefined;
      }
      return { kind: "array", of: first, span: null };
    }
    case "unary": {
      const operand = inferExprType(
        expr.operand,
        `${path}.operand`,
        scope,
        resources,
        sink,
        scalars
      );
      if (!operand) return undefined;
      // JS falsy — any typed operand yields boolean.
      return { kind: "primitive", name: "boolean", span: null };
    }
    case "cast": {
      const operand = inferExprType(
        expr.operand,
        `${path}.operand`,
        scope,
        resources,
        sink,
        scalars
      );
      if (!operand) return undefined;

      if (!canCastToPrimitive(operand, expr.type, scalars)) {
        sink.push({
          code: "INVALID_CAST",
          message: `Cannot cast ${formatType(operand)} to ${expr.type}`,
          path,
          span: expr.span,
        });
        return undefined;
      }

      const primitive: TypeExpr = { kind: "primitive", name: expr.type, span: null };
      // Preserve nullability when casting through `T | null`.
      let depth = 0;
      let cur: TypeExpr = operand;
      while (cur.kind === "nullable") {
        depth++;
        cur = cur.of;
      }
      let result: TypeExpr = primitive;
      for (let i = 0; i < depth; i++) {
        result = { kind: "nullable", of: result, span: null };
      }
      return result;
    }
    case "binary": {
      const left = inferExprType(expr.left, `${path}.left`, scope, resources, sink, scalars);
      const right = inferExprType(expr.right, `${path}.right`, scope, resources, sink, scalars);
      if (!left || !right) return undefined;

      if (expr.op === "and" || expr.op === "or") {
        return { kind: "primitive", name: "boolean", span: null };
      }

      if (expr.op === "in" || expr.op === "not in") {
        const rightInner = unwrapNullable(right);
        if (rightInner.kind !== "array") {
          sink.push({
            code: "INCOMPATIBLE_COMPARISON",
            message: `Right-hand side of '${expr.op}' must be an array, got ${formatType(right)}`,
            path,
            span: expr.span,
          });
          return undefined;
        }
        if (!comparisonCompatible(left, rightInner.of, scalars)) {
          sink.push({
            code: "INCOMPATIBLE_COMPARISON",
            message: `Cannot test ${formatType(left)} ${expr.op} ${formatType(right)}`,
            path,
            span: expr.span,
          });
          return undefined;
        }
        return { kind: "primitive", name: "boolean", span: null };
      }

      // == / !=
      if (!comparisonCompatible(left, right, scalars)) {
        sink.push({
          code: "INCOMPATIBLE_COMPARISON",
          message: `Cannot compare ${formatType(left)} and ${formatType(right)} with '${expr.op}'`,
          path,
          span: expr.span,
        });
        return undefined;
      }
      return { kind: "primitive", name: "boolean", span: null };
    }
  }
}

/**
 * Infer a payload `when` filter with progressive narrowing on `and`:
 * after the left conjunct, narrow `binding`'s payload before typing the right.
 * (`or` keeps the incoming scope for both sides.)
 */
export function inferPayloadWhenExprType(
  expr: Expr,
  path: string,
  binding: string,
  payloadType: TypeExpr,
  scope: QueryScope,
  resources: ResourceTable & PayloadTypeLookup,
  sink: DiagnosticSink,
  scalars: ScalarTable = new Map()
): TypeExpr | undefined {
  if (expr.kind === "binary" && expr.op === "and") {
    const left = inferPayloadWhenExprType(
      expr.left,
      `${path}.left`,
      binding,
      payloadType,
      scope,
      resources,
      sink,
      scalars
    );
    if (!left) return undefined;

    const previous = scope.payloadNarrowing.get(binding);
    const base = previous ?? payloadType;
    const fromLeft = narrowPayloadByFilter(base, expr.left, binding, resources);
    if (fromLeft) {
      scope.payloadNarrowing.set(binding, fromLeft);
    }

    const right = inferPayloadWhenExprType(
      expr.right,
      `${path}.right`,
      binding,
      payloadType,
      scope,
      resources,
      sink,
      scalars
    );

    if (previous !== undefined) {
      scope.payloadNarrowing.set(binding, previous);
    } else {
      scope.payloadNarrowing.delete(binding);
    }

    if (!right) return undefined;
    return { kind: "primitive", name: "boolean", span: null };
  }

  if (expr.kind === "binary" && expr.op === "or") {
    const left = inferPayloadWhenExprType(
      expr.left,
      `${path}.left`,
      binding,
      payloadType,
      scope,
      resources,
      sink,
      scalars
    );
    const right = inferPayloadWhenExprType(
      expr.right,
      `${path}.right`,
      binding,
      payloadType,
      scope,
      resources,
      sink,
      scalars
    );
    if (!left || !right) return undefined;
    return { kind: "primitive", name: "boolean", span: null };
  }

  if (expr.kind === "unary" && expr.op === "!") {
    const operand = inferPayloadWhenExprType(
      expr.operand,
      `${path}.operand`,
      binding,
      payloadType,
      scope,
      resources,
      sink,
      scalars
    );
    if (!operand) return undefined;
    return { kind: "primitive", name: "boolean", span: null };
  }

  return inferExprType(expr, path, scope, resources, sink, scalars);
}

/** True when a when-filter inference result is a boolean type. */
export function isBooleanWhenType(type: TypeExpr): boolean {
  const prim = unwrapNullable(type);
  return prim.kind === "primitive" && prim.name === "boolean";
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

  const actual = inferExprType(expr, path, scope, resources, sink, scalars);
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
