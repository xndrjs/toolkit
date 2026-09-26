/**
 * NaviQL DefinitionProvider — jump to scalar / resource / field declaration spans.
 * Uses the shared semantic snapshot (IR + tables); no Langium cross-refs.
 */
import { AstUtils, CstUtils, type AstNode, type CstNode, type LangiumDocument } from "langium";
import type { DefinitionProvider, LangiumServices } from "langium/lsp";
import type { DefinitionParams, LocationLink } from "vscode-languageserver";
import { LocationLink as LocationLinkFactory } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { ResourceTable, ScalarTable } from "../check/symbols";
import type { Program, SourceSpan } from "../ir";
import {
  isFragmentDeclaration,
  isNamedArg,
  isNamedTypeExpr,
  isObjectField,
  isProjectionClause,
  isProjectionWhenArm,
  isRefersTarget,
  isResourceConstruction,
  isResourceDeclaration,
  isScalarDeclaration,
  isTypeProjection,
  isTypedField,
} from "../lang/generated/ast";
import type { SemanticSnapshot, SemanticSnapshotCache } from "./semantic-snapshot";

export type DefinitionTables = {
  program: Program;
  scalars: ScalarTable;
  resources: ResourceTable;
};

/** Walk grammar element parents for an Assignment feature name. */
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

function enclosingProjectionResource(node: AstNode): string | undefined {
  const whenArm = AstUtils.getContainerOfType(node, isProjectionWhenArm);
  if (whenArm) {
    return whenArm.$container.resource;
  }
  const projection = AstUtils.getContainerOfType(node, isProjectionClause);
  if (projection) {
    return projection.resource;
  }
  const fragment = AstUtils.getContainerOfType(node, isFragmentDeclaration);
  return fragment?.resource;
}

function resourceDeclSpan(name: string, program: Program): SourceSpan | null {
  return program.resources.find((r) => r.name === name)?.span ?? null;
}

function scalarDeclSpan(name: string, scalars: ScalarTable): SourceSpan | null {
  return scalars.get(name)?.span ?? null;
}

function identityFieldSpan(
  resourceName: string,
  fieldName: string,
  resources: ResourceTable
): SourceSpan | null {
  return resources.get(resourceName)?.identity.get(fieldName)?.span ?? null;
}

/** Payload field first, then identity (projection selects / type projections). */
function fieldDeclSpan(
  resourceName: string,
  fieldName: string,
  resources: ResourceTable
): SourceSpan | null {
  const symbols = resources.get(resourceName);
  if (!symbols) return null;
  return symbols.payload.get(fieldName)?.span ?? symbols.identity.get(fieldName)?.span ?? null;
}

function namedTypeDeclSpan(name: string, tables: DefinitionTables): SourceSpan | null {
  return scalarDeclSpan(name, tables.scalars) ?? resourceDeclSpan(name, tables.program);
}

/**
 * Resolve the declaration {@link SourceSpan} for the AST / CST at `offset`.
 * Exported for unit tests (no full LSP harness).
 */
export function definitionSpanAtOffset(
  document: LangiumDocument,
  offset: number,
  tables: DefinitionTables,
  nameRegexp = /^[_a-zA-Z][\w_]*$/
): SourceSpan | undefined {
  const root = document.parseResult?.value?.$cstNode;
  if (!root) return undefined;

  const leaf = CstUtils.findDeclarationNodeAtOffset(root, offset, nameRegexp);
  if (!leaf || leaf.offset + leaf.length <= offset) {
    return undefined;
  }

  return definitionSpanForCstLeaf(leaf, tables);
}

export function definitionSpanForCstLeaf(
  leaf: CstNode,
  tables: DefinitionTables
): SourceSpan | undefined {
  const node = leaf.astNode;
  const text = leaf.text;
  const feature = assignmentFeature(leaf);

  if (isNamedTypeExpr(node) && (feature === "name" || feature === undefined)) {
    const span = namedTypeDeclSpan(node.name, tables);
    if (span) return span;
  }

  if (isScalarDeclaration(node) && (feature === "name" || node.name === text)) {
    const span = scalarDeclSpan(node.name, tables.scalars);
    if (span) return span;
  }

  if (isResourceDeclaration(node) && (feature === "name" || node.name === text)) {
    const span = resourceDeclSpan(node.name, tables.program);
    if (span) return span;
  }

  if (isResourceConstruction(node) && (feature === "resource" || node.resource === text)) {
    const span = resourceDeclSpan(node.resource, tables.program);
    if (span) return span;
  }

  if (isRefersTarget(node) && (feature === "resource" || node.resource === text)) {
    const span = resourceDeclSpan(node.resource, tables.program);
    if (span) return span;
  }

  if (isTypeProjection(node)) {
    if (feature === "resource" || (feature === undefined && node.resource === text)) {
      const span = resourceDeclSpan(node.resource, tables.program);
      if (span) return span;
    }
    if (feature === "field" || (feature === undefined && node.field === text)) {
      const span = fieldDeclSpan(node.resource, node.field, tables.resources);
      if (span) return span;
    }
  }

  if (isFragmentDeclaration(node)) {
    if (feature === "resource" || node.resource === text) {
      const span = resourceDeclSpan(node.resource, tables.program);
      if (span) return span;
    }
    if (feature === "selectedFields" || node.selectedFields.includes(text)) {
      const span = fieldDeclSpan(node.resource, text, tables.resources);
      if (span) return span;
    }
  }

  if (isProjectionClause(node)) {
    if (feature === "resource" || node.resource === text) {
      const span = resourceDeclSpan(node.resource, tables.program);
      if (span) return span;
    }
    if (feature === "selectedFields" || node.selectedFields.includes(text)) {
      const span = fieldDeclSpan(node.resource, text, tables.resources);
      if (span) return span;
    }
  }

  if (isProjectionWhenArm(node)) {
    if (feature === "selectedFields" || node.selectedFields.includes(text)) {
      const span = fieldDeclSpan(node.$container.resource, text, tables.resources);
      if (span) return span;
    }
  }

  if (isNamedArg(node) && (feature === "name" || node.name === text)) {
    const construction = AstUtils.getContainerOfType(node, isResourceConstruction);
    if (construction) {
      const span = identityFieldSpan(construction.resource, node.name, tables.resources);
      if (span) return span;
    }
  }

  if (isTypedField(node) && (feature === "name" || feature === undefined || node.name === text)) {
    if (node.name === text || feature === "name") {
      const resourceDecl = AstUtils.getContainerOfType(node, isResourceDeclaration);
      if (resourceDecl) {
        // Identity fields are TypedField; prefer identity when both sides share a name.
        const span =
          identityFieldSpan(resourceDecl.name, node.name, tables.resources) ??
          fieldDeclSpan(resourceDecl.name, node.name, tables.resources);
        if (span) return span;
      }
    }
  }

  if (isObjectField(node) && (feature === "name" || feature === undefined || node.name === text)) {
    if (node.name === text || feature === "name") {
      const resourceDecl = AstUtils.getContainerOfType(node, isResourceDeclaration);
      if (resourceDecl) {
        const span = fieldDeclSpan(resourceDecl.name, node.name, tables.resources);
        if (span) return span;
      }
    }
  }

  // Fallback: token text looks like a known scalar / resource name.
  if (feature === undefined || feature === "name" || feature === "resource") {
    const byName = namedTypeDeclSpan(text, tables);
    if (byName) return byName;
  }

  if (feature === "selectedFields" || feature === undefined) {
    const resourceName = enclosingProjectionResource(node);
    if (resourceName) {
      const span = fieldDeclSpan(resourceName, text, tables.resources);
      if (span) return span;
    }
  }

  return undefined;
}

function textDocumentForUri(
  uri: string,
  snapshot: SemanticSnapshot,
  current: LangiumDocument
): TextDocument | undefined {
  const fromSnapshot = snapshot.documentsByUri.get(uri);
  if (fromSnapshot) {
    return fromSnapshot.textDocument;
  }
  if (current.uri.toString() === uri) {
    return current.textDocument;
  }
  return undefined;
}

function locationLinkFromSpan(
  span: SourceSpan,
  origin: CstNode,
  snapshot: SemanticSnapshot,
  current: LangiumDocument
): LocationLink | undefined {
  const targetUri = span.uri ?? current.uri.toString();
  const targetDoc = textDocumentForUri(targetUri, snapshot, current);
  if (!targetDoc) {
    return undefined;
  }

  const start = targetDoc.positionAt(span.start);
  const end = targetDoc.positionAt(span.end);
  const targetRange = { start, end };

  return LocationLinkFactory.create(targetUri, targetRange, targetRange, origin.range);
}

export class NaviQlDefinitionProvider implements DefinitionProvider {
  constructor(
    private readonly services: LangiumServices,
    private readonly semanticSnapshot: SemanticSnapshotCache
  ) {}

  getDefinition(document: LangiumDocument, params: DefinitionParams): LocationLink[] | undefined {
    const snapshot = this.semanticSnapshot.get();
    if (!snapshot) {
      return undefined;
    }

    const offset = document.textDocument.offsetAt(params.position);
    const nameRegexp = this.services.parser.GrammarConfig.nameRegexp;
    const root = document.parseResult?.value?.$cstNode;
    if (!root) {
      return undefined;
    }

    const leaf = CstUtils.findDeclarationNodeAtOffset(root, offset, nameRegexp);
    if (!leaf || leaf.offset + leaf.length <= offset) {
      return undefined;
    }

    const span = definitionSpanForCstLeaf(leaf, snapshot);
    if (!span) {
      return undefined;
    }

    const link = locationLinkFromSpan(span, leaf, snapshot, document);
    return link ? [link] : undefined;
  }
}
