/**
 * Hover for expression paths: `p.field`, `@p.id`, `context.meta.x`, item refs.
 */
import { AstUtils, isCompositeCstNode, isLeafCstNode, type AstNode, type CstNode } from "langium";

import { createDiagnosticSink } from "../check/diagnostic";
import {
  resolveBindingPath,
  resolvePathOnFields,
  resolvePathOnItemType,
} from "../check/expr-paths";
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
  isContextRef,
  isEachComprehension,
  isFragmentDeclaration,
  isIdentityRef,
  isPathRef,
  isQueryDeclaration,
  type ContextRef,
  type EachComprehension,
  type IdentityRef,
  type PathRef,
} from "../lang/generated/ast";
import { fieldHoverMarkdown, resourceHoverMarkdown } from "./hover-markdown";

export type ExprHoverTables = {
  resources: ResourceTable;
  nameTables: NameTables;
};

function assignmentFeature(cstNode: CstNode): string | undefined {
  let current: AstNode | undefined = cstNode.grammarSource as AstNode | undefined;
  while (current) {
    if (current.$type === "Assignment") {
      const feature = (current as { feature?: unknown }).feature;
      return typeof feature === "string" ? feature : undefined;
    }
    current = current.$container;
  }
  return undefined;
}

/** Leaves under `root` whose grammar Assignment feature matches `feature`. */
function leavesWithFeature(root: CstNode, feature: string): CstNode[] {
  const out: CstNode[] = [];
  const visit = (node: CstNode): void => {
    if (isLeafCstNode(node)) {
      if (assignmentFeature(node) === feature && node.astNode === root.astNode) {
        out.push(node);
      }
      return;
    }
    if (isCompositeCstNode(node)) {
      for (const child of node.content) {
        visit(child);
      }
    }
  };
  visit(root);
  return out;
}

function hoveredFeatureIndex(node: AstNode, feature: string, leaf: CstNode): number | undefined {
  const cst = node.$cstNode;
  if (!cst) return undefined;
  const leaves = leavesWithFeature(cst, feature);
  const idx = leaves.findIndex((l) => l.offset === leaf.offset && l.end === leaf.end);
  return idx >= 0 ? idx : undefined;
}

function fieldMapAsObject(fields: FieldMap): TypeExpr {
  return {
    kind: "object",
    fields: [...fields.values()],
    span: null,
  };
}

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

function buildExprHoverScope(node: AstNode, tables: ExprHoverTables): QueryScope {
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
  }

  const fragment = AstUtils.getContainerOfType(node, isFragmentDeclaration);
  if (fragment) {
    bindings.set(fragment.binding, fragment.resource);
  }

  const scope: QueryScope = {
    path: "hover",
    params,
    context,
    bindings,
    items,
    payloadNarrowing: new Map(),
  };

  // Outer `each` first so nested sources can see outer item bindings.
  for (const each of eachAncestorsOuterFirst(node)) {
    const elementType = inferEachElementType(each, scope, tables);
    if (elementType) {
      items.set(each.itemBinding, elementType);
    }
  }

  return scope;
}

function inferEachElementType(
  each: EachComprehension,
  scope: QueryScope,
  tables: ExprHoverTables
): TypeExpr | undefined {
  const itemBindings = new Set(scope.items.keys());
  const sourceExpr = lowerExpr(each.source, itemBindings);
  const sink = createDiagnosticSink();
  const sourceType = inferExprType(sourceExpr, "hover.each", scope, tables.resources, sink);
  if (!sourceType) return undefined;
  const unwrapped = unwrapNullable(sourceType);
  if (unwrapped.kind !== "array") return undefined;
  return unwrapped.of;
}

function quietResolveBindingPath(
  binding: string,
  pathSegments: string[],
  side: "payload" | "identity",
  scope: QueryScope,
  resources: ResourceTable
): TypeExpr | undefined {
  const sink = createDiagnosticSink();
  return resolveBindingPath(binding, pathSegments, side, "hover", null, scope, resources, sink);
}

function quietResolvePathOnFields(
  pathSegments: string[],
  rootFields: FieldMap
): TypeExpr | undefined {
  if (pathSegments.length === 0) {
    return fieldMapAsObject(rootFields);
  }
  const sink = createDiagnosticSink();
  return resolvePathOnFields(
    pathSegments,
    rootFields,
    "hover",
    "UNKNOWN_CONTEXT_PATH",
    "context",
    null,
    sink
  );
}

function quietResolveItemPath(pathSegments: string[], itemType: TypeExpr): TypeExpr | undefined {
  if (pathSegments.length === 0) {
    return itemType;
  }
  const sink = createDiagnosticSink();
  return resolvePathOnItemType(pathSegments, itemType, "hover", null, sink);
}

function markdownForSegment(segment: string, type: TypeExpr | undefined): string | undefined {
  if (!type) return undefined;
  return fieldHoverMarkdown(segment, type);
}

function hoverPathRef(
  node: PathRef,
  leaf: CstNode,
  feature: string | undefined,
  tables: ExprHoverTables
): string | undefined {
  const scope = buildExprHoverScope(node, tables);
  const segmentIndex =
    feature === "segments" ? hoveredFeatureIndex(node, "segments", leaf) : undefined;
  if (segmentIndex === undefined) {
    return undefined;
  }

  const segments = node.segments;
  const head = segments[0] ?? "";
  const hoveredName = segments[segmentIndex] ?? leaf.text;

  if (scope.items.has(head)) {
    const itemType = scope.items.get(head)!;
    if (segmentIndex === 0) {
      return markdownForSegment(head, itemType);
    }
    const path = segments.slice(1, segmentIndex + 1);
    return markdownForSegment(hoveredName, quietResolveItemPath(path, itemType));
  }

  if (scope.bindings.has(head)) {
    const resourceName = scope.bindings.get(head)!;
    if (segmentIndex === 0) {
      const symbols = tables.resources.get(resourceName);
      return symbols ? resourceHoverMarkdown(resourceName, symbols) : undefined;
    }
    const path = segments.slice(1, segmentIndex + 1);
    return markdownForSegment(
      hoveredName,
      quietResolveBindingPath(head, path, "payload", scope, tables.resources)
    );
  }

  // Param (single segment) or unknown — treat head as param when index 0 / sole segment.
  if (segmentIndex === 0 || segments.length === 1) {
    const param = scope.params.get(head);
    return param ? markdownForSegment(head, param.type) : undefined;
  }

  return undefined;
}

function hoverIdentityRef(
  node: IdentityRef,
  leaf: CstNode,
  feature: string | undefined,
  tables: ExprHoverTables
): string | undefined {
  const scope = buildExprHoverScope(node, tables);
  const resourceName = scope.bindings.get(node.binding);
  const symbols = resourceName ? tables.resources.get(resourceName) : undefined;

  if (feature === "binding" || (feature === undefined && leaf.text === node.binding)) {
    if (!symbols) return undefined;
    // Whole identity bag for `@p` / binding token.
    return markdownForSegment(node.binding, fieldMapAsObject(symbols.identity));
  }

  if (feature === "path") {
    const pathIndex = hoveredFeatureIndex(node, "path", leaf);
    if (pathIndex === undefined) return undefined;
    const path = node.path.slice(0, pathIndex + 1);
    const hoveredName = node.path[pathIndex] ?? leaf.text;
    return markdownForSegment(
      hoveredName,
      quietResolveBindingPath(node.binding, path, "identity", scope, tables.resources)
    );
  }

  return undefined;
}

function hoverContextRef(
  node: ContextRef,
  leaf: CstNode,
  feature: string | undefined,
  tables: ExprHoverTables
): string | undefined {
  const scope = buildExprHoverScope(node, tables);

  // Keyword `context` (or bare ContextRef with empty path).
  if (feature === undefined && (leaf.text === "context" || node.path.length === 0)) {
    return markdownForSegment("context", fieldMapAsObject(scope.context));
  }

  if (feature === "path") {
    const pathIndex = hoveredFeatureIndex(node, "path", leaf);
    if (pathIndex === undefined) return undefined;
    const path = node.path.slice(0, pathIndex + 1);
    const hoveredName = node.path[pathIndex] ?? leaf.text;
    return markdownForSegment(hoveredName, quietResolvePathOnFields(path, scope.context));
  }

  return undefined;
}

function hoverEachItemBinding(
  node: EachComprehension,
  leaf: CstNode,
  feature: string | undefined,
  tables: ExprHoverTables
): string | undefined {
  if (feature !== "itemBinding" && leaf.text !== node.itemBinding) {
    return undefined;
  }
  const scope = buildExprHoverScope(node, tables);
  const itemType = scope.items.get(node.itemBinding);
  if (!itemType) return undefined;
  return markdownForSegment(node.itemBinding, itemType);
}

/**
 * Hover markdown for payload / identity / context / item path expressions.
 * Returns undefined when the leaf is not part of such an expression.
 */
export function hoverMarkdownForExprPath(
  leaf: CstNode,
  feature: string | undefined,
  tables: ExprHoverTables
): string | undefined {
  const node = leaf.astNode;

  if (isEachComprehension(node)) {
    return hoverEachItemBinding(node, leaf, feature, tables);
  }
  if (isPathRef(node)) {
    return hoverPathRef(node, leaf, feature, tables);
  }
  if (isIdentityRef(node)) {
    return hoverIdentityRef(node, leaf, feature, tables);
  }
  if (isContextRef(node)) {
    return hoverContextRef(node, leaf, feature, tables);
  }
  return undefined;
}
