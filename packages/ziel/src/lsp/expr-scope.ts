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
import type { TypeExpr } from "../ir";
import {
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

function applyPayloadNarrowing(
  binding: string,
  resourceName: string,
  whenExpr: Expression,
  scope: QueryScope,
  resources: ResourceTable
): void {
  const symbols = resources.get(resourceName);
  if (!symbols) return;
  try {
    const narrowed =
      narrowPayloadByFilter(symbols.payloadType, lowerExpr(whenExpr), binding, resources) ??
      undefined;
    if (narrowed) {
      scope.payloadNarrowing.set(binding, narrowed);
    }
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

function applyWhenArmNarrowing(node: AstNode, scope: QueryScope, resources: ResourceTable): void {
  const whenArm = AstUtils.getContainerOfType(node, isProjectionWhenArm);
  if (whenArm) {
    // Editing the filter itself — keep the full payload so literal completions
    // see every discriminant value (not the arm's own narrow).
    if (!isInsideAst(node, whenArm.when)) {
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
    if (!isInsideAst(node, fragment.when)) {
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
