import type { Expr } from "../../../ir";

/** Join a property path onto a base identifier (`payload`, `s`, …). */
function memberAccess(base: string, path: readonly string[]): string {
  if (path.length === 0) {
    return base;
  }
  return `${base}.${path.join(".")}`;
}

/**
 * Lower an IR `Expr` to a TypeScript expression fragment for strategy codegen.
 *
 * | IR              | TS                                      |
 * | --------------- | --------------------------------------- |
 * | `param`         | `params.name`                           |
 * | `context`       | `executionContext.field…`               |
 * | `payloadRef`    | `payload.field…` (binding discarded)    |
 * | `identityRef`   | `resource.key[0].field…`                |
 * | `itemRef`       | `binding.field…` (comprehension item)   |
 * | `literal`       | JSON / `null`                           |
 * | `binary` `==`/`!=` | `left op right`                      |
 */
export function emitExpr(expr: Expr): string {
  switch (expr.kind) {
    case "literal":
      if (expr.value === null) {
        return "null";
      }
      return JSON.stringify(expr.value);
    case "param":
      return `params.${expr.name}`;
    case "context":
      return memberAccess("executionContext", expr.path);
    case "payloadRef":
      return memberAccess("payload", expr.path);
    case "identityRef":
      return memberAccess("resource.key[0]", expr.path);
    case "itemRef":
      return memberAccess(expr.binding, expr.path);
    case "binary":
      return `${emitExpr(expr.left)} ${expr.op} ${emitExpr(expr.right)}`;
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
