import type { Expr, NamedArg, ResourceConstruction } from "../../ir";
import {
  isBinaryExpr,
  isBooleanLiteral,
  isContextRef,
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
      op: expr.op,
      left: lowerExpr(expr.left, itemBindings),
      right: lowerExpr(expr.right, itemBindings),
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

  const _never: never = expr;
  return _never;
}
