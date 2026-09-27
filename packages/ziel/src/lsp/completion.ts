/**
 * Ziel CompletionProvider — scalars / resources / payload fields / construction args.
 * Keywords stay on Langium's DefaultCompletionProvider follow-set.
 */
import { AstUtils, CstUtils, type AstNode, type CstNode, type LangiumDocument } from "langium";
import { DefaultCompletionProvider, type LangiumServices } from "langium/lsp";
import type { CompletionItem, CompletionList, CompletionParams } from "vscode-languageserver";
import { CompletionItemKind, CompletionList as CompletionListFactory } from "vscode-languageserver";

import { formatType } from "../check/assignability";
import { expandPayloadObjectMembers, narrowPayloadByFilter } from "../check/discriminants";
import type { ResourceTable, ScalarTable } from "../check/symbols";
import { lowerExpr } from "../compile/lower/expr";
import type { TypeExpr } from "../ir";
import {
  isExpandArm,
  isExpansion,
  isFragmentDeclaration,
  isIslandClause,
  isNamedArg,
  isNamedTypeExpr,
  isObjectField,
  isProjectionClause,
  isProjectionWhenArm,
  isRefersTarget,
  isResolveArm,
  isResourceConstruction,
  isTypeProjection,
  isTypedField,
  type Expression,
  type ResourceConstruction,
} from "../lang/generated/ast";
import { pathCompletionsAtOffset } from "./completion-path";
import type { SemanticSnapshotCache } from "./semantic-snapshot";

export type CompletionTables = {
  scalars: ScalarTable;
  resources: ResourceTable;
};

function nameTablesFrom(tables: CompletionTables) {
  return {
    scalars: new Set(tables.scalars.keys()),
    resources: new Set(tables.resources.keys()),
  };
}

/** Lightweight completion proposal (unit-tested without full LSP text edits). */
export type SemanticCompletionItem = {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
};

type SemanticContext =
  | { kind: "types" }
  | { kind: "resources" }
  | {
      kind: "payloadFields";
      resourceName: string;
      binding: string;
      when?: Expression;
    }
  | { kind: "identityArgs"; resourceName: string; used: ReadonlySet<string> };

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

/** Trailing identifier characters before `offset` (partial token being typed). */
export function completionPrefix(text: string, offset: number): string {
  const before = text.slice(0, offset);
  const match = /[\w_]*$/.exec(before);
  return match?.[0] ?? "";
}

function matchesPrefix(label: string, prefix: string): boolean {
  if (!prefix) return true;
  return label.toLowerCase().startsWith(prefix.toLowerCase());
}

/** Field names selectable on a payload (intersection across closed object unions). */
export function selectableFieldNames(payloadType: TypeExpr, resources: ResourceTable): string[] {
  const members = expandPayloadObjectMembers(payloadType, resources);
  if (!members || members.length === 0) return [];

  const [first, ...rest] = members;
  if (!first) return [];
  if (rest.length === 0) {
    return first.fields.map((f) => f.name);
  }

  return first.fields
    .map((f) => f.name)
    .filter((name) => rest.every((member) => member.fields.some((f) => f.name === name)));
}

function fieldTypeDetail(
  name: string,
  payloadType: TypeExpr,
  resources: ResourceTable,
  resourceName: string
): string | undefined {
  const symbols = resources.get(resourceName);
  const fromMap = symbols?.payload.get(name)?.type ?? symbols?.identity.get(name)?.type;
  if (fromMap) return formatType(fromMap);

  const members = expandPayloadObjectMembers(payloadType, resources);
  const fromMember = members?.flatMap((m) => m.fields).find((f) => f.name === name);
  return fromMember ? formatType(fromMember.type) : undefined;
}

function payloadFieldsForResource(
  resourceName: string,
  resources: ResourceTable,
  when: Expression | undefined,
  binding: string
): SemanticCompletionItem[] {
  const symbols = resources.get(resourceName);
  if (!symbols) return [];

  let payloadType = symbols.payloadType;
  if (when) {
    try {
      const lowered = lowerExpr(when);
      payloadType = narrowPayloadByFilter(payloadType, lowered, binding, resources) ?? payloadType;
    } catch {
      // Incomplete when-expr: fall back to full payload.
    }
  }

  return selectableFieldNames(payloadType, resources).map((name) => ({
    label: name,
    kind: CompletionItemKind.Field,
    detail: fieldTypeDetail(name, payloadType, resources, resourceName),
  }));
}

function typeCompletions(tables: CompletionTables): SemanticCompletionItem[] {
  const items: SemanticCompletionItem[] = [];
  for (const [name, scalar] of tables.scalars) {
    items.push({
      label: name,
      kind: CompletionItemKind.TypeParameter,
      detail: `scalar ${name} on ${scalar.representation}`,
    });
  }
  for (const name of tables.resources.keys()) {
    items.push({
      label: name,
      kind: CompletionItemKind.Class,
      detail: `resource ${name}`,
    });
  }
  return items;
}

function resourceCompletions(tables: CompletionTables): SemanticCompletionItem[] {
  return [...tables.resources.keys()].map((name) => ({
    label: name,
    kind: CompletionItemKind.Class,
    detail: "resource",
  }));
}

function identityArgCompletions(
  resourceName: string,
  used: ReadonlySet<string>,
  resources: ResourceTable
): SemanticCompletionItem[] {
  const symbols = resources.get(resourceName);
  if (!symbols) return [];
  return [...symbols.identity.values()]
    .filter((field) => !used.has(field.name))
    .map((field) => ({
      label: field.name,
      kind: CompletionItemKind.Property,
      detail: `${field.name}: ${formatType(field.type)}`,
    }));
}

function proposalsForContext(
  context: SemanticContext,
  tables: CompletionTables
): SemanticCompletionItem[] {
  switch (context.kind) {
    case "types":
      return typeCompletions(tables);
    case "resources":
      return resourceCompletions(tables);
    case "payloadFields":
      return payloadFieldsForResource(
        context.resourceName,
        tables.resources,
        context.when,
        context.binding
      );
    case "identityArgs":
      return identityArgCompletions(context.resourceName, context.used, tables.resources);
  }
}

/** Identity args already present, excluding the name currently being edited. */
function usedNamedArgs(construction: ResourceConstruction, currentName?: string): Set<string> {
  return new Set(
    construction.args.map((a) => a.name).filter((n): n is string => Boolean(n) && n !== currentName)
  );
}

function payloadContextFromNode(node: AstNode): SemanticContext | undefined {
  const whenArm = AstUtils.getContainerOfType(node, isProjectionWhenArm);
  if (whenArm) {
    const clause = whenArm.$container;
    return {
      kind: "payloadFields",
      resourceName: clause.resource,
      binding: clause.binding,
      when: whenArm.when,
    };
  }
  const projection = AstUtils.getContainerOfType(node, isProjectionClause);
  if (projection && projection.resolveArms.length === 0) {
    return {
      kind: "payloadFields",
      resourceName: projection.resource,
      binding: projection.binding,
    };
  }
  const fragment = AstUtils.getContainerOfType(node, isFragmentDeclaration);
  if (fragment) {
    return {
      kind: "payloadFields",
      resourceName: fragment.resource,
      binding: fragment.binding,
      when: fragment.when,
    };
  }
  return undefined;
}

/** True when `node` is under an expand / resolve arm (not a sibling selected field). */
function isInsideExpansionOrResolve(node: AstNode): boolean {
  let current: AstNode | undefined = node;
  while (current) {
    if (isExpansion(current) || isExpandArm(current) || isResolveArm(current)) {
      return true;
    }
    if (
      isProjectionClause(current) ||
      isProjectionWhenArm(current) ||
      isFragmentDeclaration(current)
    ) {
      return false;
    }
    current = current.$container;
  }
  return false;
}

/**
 * Classify semantic completion context from AST / CST at `offset`.
 * Exported for unit tests.
 */
export function classifyCompletionContext(
  document: LangiumDocument,
  offset: number
): SemanticContext | undefined {
  const root = document.parseResult?.value?.$cstNode;
  if (!root) return undefined;

  const text = document.textDocument.getText();
  const before = text.slice(0, offset);

  // Incomplete `on <Resource>` / `refers <Resource>` (follow-set may not yield IDs).
  if (/\bon\s+[\w_]*$/.test(before)) {
    const tail = before.slice(Math.max(0, before.length - 48));
    // Not yet past the binding slot: `on Entry e` has two IDs after `on`.
    if (!/\bon\s+[\w_]+\s+[\w_]+\s*$/.test(tail)) {
      return { kind: "resources" };
    }
  }
  if (/\brefers\s+[\w_]*$/.test(before)) {
    return { kind: "resources" };
  }

  const leaf =
    CstUtils.findLeafNodeBeforeOffset(root, offset) ??
    CstUtils.findDeclarationNodeAtOffset(root, offset);
  if (!leaf) return undefined;

  const node = leaf.astNode;
  const feature = assignmentFeature(leaf);

  if (isNamedTypeExpr(node)) {
    return { kind: "types" };
  }

  if (isTypedField(node) || isObjectField(node)) {
    if (feature === "type") {
      return { kind: "types" };
    }
  }

  if (
    (isProjectionClause(node) ||
      isIslandClause(node) ||
      isFragmentDeclaration(node) ||
      isResourceConstruction(node)) &&
    (feature === "resource" || (feature === undefined && node.resource === leaf.text))
  ) {
    return { kind: "resources" };
  }

  if (isRefersTarget(node) && (feature === "resource" || node.resource === leaf.text)) {
    return { kind: "resources" };
  }

  if (isTypeProjection(node)) {
    if (feature === "resource" || (feature === undefined && node.resource === leaf.text)) {
      return { kind: "resources" };
    }
    if (feature === "field" || (feature === undefined && node.field === leaf.text)) {
      return {
        kind: "payloadFields",
        resourceName: node.resource,
        binding: "",
      };
    }
  }

  if (
    (isProjectionClause(node) || isProjectionWhenArm(node) || isFragmentDeclaration(node)) &&
    (feature === "selectedFields" ||
      ("selectedFields" in node && node.selectedFields.includes(leaf.text)))
  ) {
    return payloadContextFromNode(node);
  }

  if (isNamedArg(node) && (feature === "name" || node.name === leaf.text)) {
    const construction = node.$container;
    if (isResourceConstruction(construction) && construction.resource) {
      return {
        kind: "identityArgs",
        resourceName: construction.resource,
        used: usedNamedArgs(construction, node.name),
      };
    }
  }

  if (isResourceConstruction(node) && node.resource) {
    if (feature === "resource") {
      return { kind: "resources" };
    }
    const recent = before.slice(Math.max(0, offset - 40), offset);
    // Inside `(…)` arg list, not in a value after `:`.
    if (/[,(]\s*[\w_]*$/.test(recent) && !/:\s*[\w_.@"']*$/.test(recent)) {
      return {
        kind: "identityArgs",
        resourceName: node.resource,
        used: usedNamedArgs(node),
      };
    }
  }

  // Projection / fragment body after `{` or on a selected-field token.
  if (!isInsideExpansionOrResolve(node)) {
    const projection = AstUtils.getContainerOfType(node, isProjectionClause);
    if (projection && projection.resolveArms.length > 0) {
      if (/\{\s*[\w_]*$/.test(before.slice(Math.max(0, offset - 20), offset))) {
        return { kind: "resources" };
      }
    } else if (leaf.text === "{" || feature === "selectedFields") {
      const payload = payloadContextFromNode(node);
      if (payload) return payload;
    }
  }

  // After `:` in TypedField / ObjectField before NamedTypeExpr exists.
  if (/:\s*[\w_]*$/.test(before.slice(Math.max(0, offset - 48), offset))) {
    if (
      AstUtils.getContainerOfType(node, isTypedField) ||
      AstUtils.getContainerOfType(node, isObjectField)
    ) {
      return { kind: "types" };
    }
  }

  return undefined;
}

/**
 * Semantic completion labels at `offset` (filtered by partial prefix).
 * Exported for unit tests (no full LSP harness).
 */
export function completionsAtOffset(
  document: LangiumDocument,
  offset: number,
  tables: CompletionTables
): SemanticCompletionItem[] {
  // Property paths (`@p.`, `p.`, `context.`, item) take priority over other contexts.
  const pathItems = pathCompletionsAtOffset(document, offset, {
    resources: tables.resources,
    nameTables: nameTablesFrom(tables),
  });
  if (pathItems) {
    return pathItems;
  }

  const context = classifyCompletionContext(document, offset);
  if (!context) return [];

  const prefix = completionPrefix(document.textDocument.getText(), offset);
  return proposalsForContext(context, tables).filter((item) => matchesPrefix(item.label, prefix));
}

function toLspItem(
  item: SemanticCompletionItem,
  document: LangiumDocument,
  offset: number,
  prefix: string
): CompletionItem {
  const start = document.textDocument.positionAt(offset - prefix.length);
  const end = document.textDocument.positionAt(offset);
  return {
    label: item.label,
    kind: item.kind,
    detail: item.detail,
    sortText: `0_${item.label}`,
    textEdit: {
      range: { start, end },
      newText: item.label,
    },
  };
}

export class ZielCompletionProvider extends DefaultCompletionProvider {
  constructor(
    services: LangiumServices,
    private readonly semanticSnapshot: SemanticSnapshotCache
  ) {
    super(services);
  }

  override async getCompletion(
    document: LangiumDocument,
    params: CompletionParams,
    cancelToken?: Parameters<DefaultCompletionProvider["getCompletion"]>[2]
  ): Promise<CompletionList | undefined> {
    // Keywords from Langium grammar follow-set.
    const base = await super.getCompletion(document, params, cancelToken);
    const snapshot = this.semanticSnapshot.get();
    if (!snapshot) {
      return base;
    }

    const offset = document.textDocument.offsetAt(params.position);
    const prefix = completionPrefix(document.textDocument.getText(), offset);
    const semantic = completionsAtOffset(document, offset, snapshot).map((item) =>
      toLspItem(item, document, offset, prefix)
    );

    const merged = [...(base?.items ?? []), ...semantic];
    return CompletionListFactory.create(this.deduplicateItems(merged), true);
  }

  /**
   * Keep collecting keyword follow-set proposals even when some items exist,
   * so keywords + semantic suggestions can coexist. Semantic items are merged
   * in {@link getCompletion}.
   */
  protected override continueCompletion(_items: CompletionItem[]): boolean {
    return true;
  }
}
