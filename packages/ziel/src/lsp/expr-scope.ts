/**
 * QueryScope for expression IntelliSense (hover / completion of path refs).
 */
import { AstUtils, type AstNode } from "langium";

import { createDiagnosticSink } from "../check/diagnostic";
import { narrowPayloadByFilter } from "../check/discriminants";
import { inferExprType } from "../check/expressions";
import {
  unwrapNullable,
  type FieldMap,
  type QueryScope,
  type ResourceTable,
} from "../check/symbols";
import { lowerExpr } from "../compile/lower/expr";
import { lowerTypedField, type NameTables } from "../compile/lower/types";
import type { Expr, TypeExpr } from "../ir";
import {
  isBinaryExpr,
  isEachComprehension,
  isFragmentDeclaration,
  isProjectionWhenArm,
  isQueryDeclaration,
  type EachComprehension,
  type Expression,
} from "../lang/generated/ast";

export type ExprScopeTables = {
  resources: ResourceTable;
  nameTables: NameTables;
};

function eachAncestorsOuterFirst(node: AstNode): EachComprehension[] {
  const chain: EachComprehension[] = [];
  let current: AstNode | undefined = node;
  while (current) {
    if (isEachComprehension(current)) {
      chain.push(current);
    }
    current = current.$container;
  }
  return chain.reverse();
}

function inferEachElementType(
  each: EachComprehension,
  scope: QueryScope,
  tables: ExprScopeTables
): TypeExpr | undefined {
  const itemBindings = new Set(scope.items.keys());
  const sourceExpr = lowerExpr(each.source, itemBindings);
  const sink = createDiagnosticSink();
  const sourceType = inferExprType(sourceExpr, "expr.each", scope, tables.resources, sink);
  if (!sourceType) return undefined;
  const unwrapped = unwrapNullable(sourceType);
  if (unwrapped.kind !== "array") return undefined;
  return unwrapped.of;
}

function applyPayloadNarrowingFromIr(
  binding: string,
  resourceName: string,
  filter: Expr,
  scope: QueryScope,
  resources: ResourceTable
): void {
  const symbols = resources.get(resourceName);
  if (!symbols) return;
  try {
    const narrowed = narrowPayloadByFilter(symbols.payloadType, filter, binding, resources);
    if (narrowed) {
      scope.payloadNarrowing.set(binding, narrowed);
    }
  } catch {
    // Incomplete when-expr — leave un-narrowed.
  }
}

function applyPayloadNarrowing(
  binding: string,
  resourceName: string,
  whenExpr: Expression,
  scope: QueryScope,
  resources: ResourceTable
): void {
  try {
    applyPayloadNarrowingFromIr(binding, resourceName, lowerExpr(whenExpr), scope, resources);
  } catch {
    // Incomplete when-expr — leave un-narrowed.
  }
}

function isInsideAst(node: AstNode, root: AstNode | undefined): boolean {
  if (!root) return false;
  let current: AstNode | undefined = node;
  while (current) {
    if (current === root) return true;
    current = current.$container;
  }
  return false;
}

function combineAndFilters(filters: Expr[]): Expr | undefined {
  if (filters.length === 0) return undefined;
  return filters.reduce((left, right) => ({
    kind: "binary" as const,
    op: "and" as const,
    left,
    right,
    span: null,
  }));
}

/**
 * Left `and` conjuncts that dominate `node` under `whenRoot`
 * (so `A and B` while editing `B` narrows by `A` only).
 */
function leftAndConjunctFilters(node: AstNode, whenRoot: Expression): Expr[] {
  const parts: Expr[] = [];
  let current: AstNode | undefined = node;
  while (current && current !== whenRoot) {
    const parent: AstNode | undefined = current.$container;
    if (!parent) break;
    if (
      isBinaryExpr(parent) &&
      parent.op === "and" &&
      isInsideAst(parent, whenRoot) &&
      parent.left &&
      (current === parent.right || isInsideAst(current, parent.right))
    ) {
      try {
        parts.push(lowerExpr(parent.left));
      } catch {
        // Incomplete left conjunct — skip.
      }
    }
    current = parent;
  }
  return parts;
}

function applyFilterPrefixNarrowing(
  node: AstNode,
  whenRoot: Expression,
  binding: string,
  resourceName: string,
  scope: QueryScope,
  resources: ResourceTable
): void {
  const combined = combineAndFilters(leftAndConjunctFilters(node, whenRoot));
  if (!combined) return;
  applyPayloadNarrowingFromIr(binding, resourceName, combined, scope, resources);
}

function applyWhenArmNarrowing(node: AstNode, scope: QueryScope, resources: ResourceTable): void {
  const whenArm = AstUtils.getContainerOfType(node, isProjectionWhenArm);
  if (whenArm) {
    if (isInsideAst(node, whenArm.when) && whenArm.when) {
      // Inside the filter: narrow only by completed left `and` conjuncts so
      // `e.kind == "Footer" and e.cta` sees Footer fields, while `kind == "`
      // still sees the full discriminant set.
      applyFilterPrefixNarrowing(
        node,
        whenArm.when,
        whenArm.$container.binding,
        whenArm.$container.resource,
        scope,
        resources
      );
    } else if (whenArm.when) {
      applyPayloadNarrowing(
        whenArm.$container.binding,
        whenArm.$container.resource,
        whenArm.when,
        scope,
        resources
      );
    }
    return;
  }

  const fragment = AstUtils.getContainerOfType(node, isFragmentDeclaration);
  if (fragment?.when) {
    if (isInsideAst(node, fragment.when)) {
      applyFilterPrefixNarrowing(
        node,
        fragment.when,
        fragment.binding,
        fragment.resource,
        scope,
        resources
      );
    } else {
      applyPayloadNarrowing(fragment.binding, fragment.resource, fragment.when, scope, resources);
    }
  }
}

/**
 * Build a QueryScope at `node` for path hover / completion:
 * params, context, projection/fragment/island bindings, enclosing `each` items,
 * and payload narrowing when inside a projection `when` arm or fragment `when`.
 */
export function buildExprScope(node: AstNode, tables: ExprScopeTables): QueryScope {
  const params: FieldMap = new Map();
  const context: FieldMap = new Map();
  const bindings = new Map<string, string>();
  const items = new Map<string, TypeExpr>();

  const query = AstUtils.getContainerOfType(node, isQueryDeclaration);
  if (query) {
    for (const field of query.parameters) {
      params.set(field.name, lowerTypedField(field, tables.nameTables));
    }
    if (query.context) {
      for (const field of query.context.fields) {
        context.set(field.name, lowerTypedField(field, tables.nameTables));
      }
    }
    for (const projection of query.projections) {
      bindings.set(projection.binding, projection.resource);
    }
    for (const clause of query.islands?.clauses ?? []) {
      if (clause.binding) {
        bindings.set(clause.binding, clause.resource);
      }
    }
  }

  const fragment = AstUtils.getContainerOfType(node, isFragmentDeclaration);
  if (fragment) {
    bindings.set(fragment.binding, fragment.resource);
  }

  const scope: QueryScope = {
    path: "expr",
    params,
    context,
    bindings,
    items,
    payloadNarrowing: new Map(),
  };

  for (const each of eachAncestorsOuterFirst(node)) {
    const elementType = inferEachElementType(each, scope, tables);
    if (elementType) {
      items.set(each.itemBinding, elementType);
    }
  }

  applyWhenArmNarrowing(node, scope, tables.resources);
  return scope;
}
