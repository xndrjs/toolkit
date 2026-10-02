import { payloadDiscriminantLiteral } from "../../../check/discriminants";
import type { Expr } from "../../../ir";

/** How IR refs lower to TS identifiers (dot chains, no destructuring). */
export type EmitExprScope = {
  /** Prefix for `param` refs, e.g. `params` or `args.params`. */
  params: string;
  /** Prefix for `context` refs, e.g. `executionContext` or `ctx.executionContext`. */
  executionContext: string;
  /** Prefix for `payloadRef`, e.g. `payload` or `ctx.payload`. */
  payload: string;
  /** Prefix for `identityRef` root, e.g. `resource` or `ctx.resource`. */
  resource: string;
};

/** Default scope for projection helpers (`resource`/`payload` locals + `args.*`). */
export const projectionExprScope: EmitExprScope = {
  params: "args.params",
  executionContext: "args.executionContext",
  payload: "payload",
  resource: "resource",
};

/** Scope inside strategy `.when` / flat `.expand` / flat `.to` (`predicate`). */
export const strategyExprScope: EmitExprScope = {
  params: "params",
  executionContext: "predicate.executionContext",
  payload: "predicate.payload",
  resource: "predicate.resource",
};

/**
 * Armed expand/to after rebinding `predicate.payload` to the semantic arm type;
 * resource / executionContext stay on `predicate`.
 */
export const strategyArmedBodyScope: EmitExprScope = {
  params: "params",
  executionContext: "predicate.executionContext",
  payload: "payload",
  resource: "predicate.resource",
};

/**
 * Datasource route `when` — destructured `{ executionContext, resource }` locals
 * on `SourceRouteContext`.
 */
export const datasourceExprScope: EmitExprScope = {
  params: "params",
  executionContext: "executionContext",
  payload: "payload",
  resource: "resource",
};

/** Join a property path onto a base identifier (`payload`, `ctx.payload`, …). */
function memberAccess(base: string, path: readonly string[]): string {
  if (path.length === 0) {
    return base;
  }
  return `${base}.${path.join(".")}`;
}

/**
 * Lower an IR `Expr` to a TypeScript expression fragment.
 *
 * | IR              | TS (default projection scope)              |
 * | --------------- | ------------------------------------------ |
 * | `param`         | `args.params.name`                         |
 * | `context`       | `args.executionContext.field…`             |
 * | `payloadRef`    | `payload.field…` (binding discarded)       |
 * | `identityRef`   | `resource.key.field…`                      |
 * | `itemRef`       | `binding.field…` (comprehension item)      |
 * | `literal`       | JSON / `null`                              |
 * | `arrayLiteral`  | `[…]`                                      |
 * | `unary` `!`     | `!(operand)`                               |
 * | `cast`          | operand (erase; branded scalars are TS-only) |
 * | `binary` `==`/`!=` | `left op right`                         |
 * | `binary` `in`   | `right.includes(left)`                     |
 * | `binary` `not in` | `!right.includes(left)`                  |
 * | `binary` `and`/`or` | `(left && right)` / `(left \|\| right)` |
 */
export function emitExpr(expr: Expr, scope: EmitExprScope = projectionExprScope): string {
  switch (expr.kind) {
    case "literal":
      if (expr.value === null) {
        return "null";
      }
      return JSON.stringify(expr.value);
    case "param":
      return `${scope.params}.${expr.name}`;
    case "context":
      return memberAccess(scope.executionContext, expr.path);
    case "payloadRef":
      return memberAccess(scope.payload, expr.path);
    case "identityRef":
      return memberAccess(`${scope.resource}.key`, expr.path);
    case "itemRef":
      return memberAccess(expr.binding, expr.path);
    case "arrayLiteral":
      return `[${expr.elements.map((el) => emitExpr(el, scope)).join(", ")}]`;
    case "unary":
      return `!(${emitExpr(expr.operand, scope)})`;
    case "cast":
      // Nominal scalars erase at runtime — cast is a type-check-only operation.
      return emitExpr(expr.operand, scope);
    case "binary":
      if (expr.op === "in") {
        return `${emitExpr(expr.right, scope)}.includes(${emitExpr(expr.left, scope)})`;
      }
      if (expr.op === "not in") {
        return `!${emitExpr(expr.right, scope)}.includes(${emitExpr(expr.left, scope)})`;
      }
      if (expr.op === "and") {
        return `(${emitExpr(expr.left, scope)} && ${emitExpr(expr.right, scope)})`;
      }
      if (expr.op === "or") {
        return `(${emitExpr(expr.left, scope)} || ${emitExpr(expr.right, scope)})`;
      }
      return `${emitExpr(expr.left, scope)} ${expr.op} ${emitExpr(expr.right, scope)}`;
    default: {
      const _never: never = expr;
      return _never;
    }
  }
}

/**
 * Extract `"Hero"` from a projection arm filter `binding.<field> == "Hero"`
 * (any single-segment payload path). Returns `null` when the filter is not a
 * payload discriminant equality.
 */
export function projectionArmDiscriminant(when: Expr, binding: string): string | null {
  if (when.kind !== "binary") return null;
  return payloadDiscriminantLiteral(when, binding)?.value ?? null;
}
