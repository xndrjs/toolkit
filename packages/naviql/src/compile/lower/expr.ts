import type { Expr, NamedArg, ResourceConstruction } from "../../ir";
import {
  isArrayLiteral,
  isBinaryExpr,
  isBooleanLiteral,
  isContextRef,
  isGroupedExpr,
  isIdentityRef,
  isNullLiteral,
  isNumberLiteral,
  isPathRef,
  isStringLiteral,
  type Expression as AstExpression,
  type NamedArg as AstNamedArg,
  type ResourceConstruction as AstResourceConstruction,
} from "../../lang/generated/ast";
import { spanOf } from "./span";

type BinaryOp = "==" | "!=" | "in" | "not in" | "and" | "or";

/** Langium MembershipOp concatenates `not`+`in` → `notin`; normalize to IR. */
function normalizeBinaryOp(op: string): BinaryOp {
  if (op === "notin" || op === "not in") return "not in";
  if (op === "in" || op === "==" || op === "!=" || op === "and" || op === "or") {
    return op;
  }
  throw new Error(`Unexpected binary op '${op}'`);
}

export function lowerConstruction(
  construction: AstResourceConstruction,
  itemBindings = new Set<string>()
): ResourceConstruction {
  return {
    resource: construction.resource,
    args: construction.args.map((a) => lowerNamedArg(a, itemBindings)),
    span: spanOf(construction),
  };
}

export function lowerNamedArg(arg: AstNamedArg, itemBindings = new Set<string>()): NamedArg {
  return {
    name: arg.name,
    value: lowerExpr(arg.value, itemBindings),
    span: spanOf(arg),
  };
}

export function lowerExpr(expr: AstExpression, itemBindings = new Set<string>()): Expr {
  const span = spanOf(expr);

  if (isBinaryExpr(expr)) {
    return {
      kind: "binary",
      op: normalizeBinaryOp(expr.op),
      left: lowerExpr(expr.left, itemBindings),
      right: lowerExpr(expr.right, itemBindings),
      span,
    };
  }

  // Unary `!` only — Primary alternatives also inherit UnaryExpr in the type hierarchy.
  if (expr.$type === "UnaryExpr" && expr.op === "!" && expr.operand) {
    return {
      kind: "unary",
      op: "!",
      operand: lowerExpr(expr.operand, itemBindings),
      span,
    };
  }

  if (isGroupedExpr(expr)) {
    return lowerExpr(expr.expr, itemBindings);
  }

  if (isArrayLiteral(expr)) {
    return {
      kind: "arrayLiteral",
      elements: expr.elements.map((el) => lowerExpr(el, itemBindings)),
      span,
    };
  }

  if (isStringLiteral(expr)) {
    return { kind: "literal", value: expr.value, span };
  }
  if (isNumberLiteral(expr)) {
    return { kind: "literal", value: Number(expr.value), span };
  }
  if (isBooleanLiteral(expr)) {
    return { kind: "literal", value: expr.value === "true", span };
  }
  if (isNullLiteral(expr)) {
    return { kind: "literal", value: null, span };
  }
  if (isContextRef(expr)) {
    return { kind: "context", path: [...expr.path], span };
  }
  if (isIdentityRef(expr)) {
    return {
      kind: "identityRef",
      binding: expr.binding,
      path: [...expr.path],
      span,
    };
  }
  if (isPathRef(expr)) {
    const head = expr.segments[0] ?? "";
    if (itemBindings.has(head)) {
      return {
        kind: "itemRef",
        binding: head,
        path: expr.segments.slice(1),
        span,
      };
    }
    if (expr.segments.length <= 1) {
      return { kind: "param", name: head, span };
    }
    return {
      kind: "payloadRef",
      binding: head,
      path: expr.segments.slice(1),
      span,
    };
  }

  throw new Error(`Unhandled expression AST node '${String((expr as { $type?: string }).$type)}'`);
}
