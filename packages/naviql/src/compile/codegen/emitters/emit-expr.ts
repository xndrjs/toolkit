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
 * Armed expand/to after `const payload = predicate.payload as any` — payload is
 * local; resource / executionContext stay on `predicate`.
 */
export const strategyArmedBodyScope: EmitExprScope = {
  params: "params",
  executionContext: "predicate.executionContext",
  payload: "payload",
  resource: "predicate.resource",
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
 * | `identityRef`   | `resource.key[0].field…`                   |
 * | `itemRef`       | `binding.field…` (comprehension item)      |
 * | `literal`       | JSON / `null`                              |
 * | `binary` `==`/`!=` | `left op right`                         |
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
      return memberAccess(`${scope.resource}.key[0]`, expr.path);
    case "itemRef":
      return memberAccess(expr.binding, expr.path);
    case "binary":
      return `${emitExpr(expr.left, scope)} ${expr.op} ${emitExpr(expr.right, scope)}`;
    default: {
      const _never: never = expr;
      return _never;
    }
  }
}

/**
 * Extract `"Hero"` from a projection arm filter `binding.type == "Hero"`.
 * Returns `null` when the filter is not a payload `type` equality.
 */
export function projectionArmDiscriminant(when: Expr, binding: string): string | null {
  if (when.kind !== "binary" || when.op !== "==") {
    return null;
  }

  const sides: { left: Expr; right: Expr }[] = [
    { left: when.left, right: when.right },
    { left: when.right, right: when.left },
  ];
  for (const { left, right } of sides) {
    if (
      left.kind === "payloadRef" &&
      left.binding === binding &&
      left.path.length === 1 &&
      left.path[0] === "type" &&
      right.kind === "literal" &&
      typeof right.value === "string"
    ) {
      return right.value;
    }
  }
  return null;
}
