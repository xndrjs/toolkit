/**
 * Ziel HoverProvider — scalar / resource / field / fragment / path previews.
 * Does not rely on Langium cross-refs (grammar uses bare IDs).
 */
import { AstUtils, CstUtils, type AstNode, type CstNode, type LangiumDocument } from "langium";
import type { HoverProvider, LangiumServices } from "langium/lsp";
import type { Hover, HoverParams } from "vscode-languageserver";

import type { ResourceTable, ScalarTable } from "../check/symbols";
import type { FieldDecl, TypeExpr } from "../ir";
import { lowerObjectField, lowerTypedField, type NameTables } from "../compile/lower/types";
import {
  isFragmentDeclaration,
  isFragmentSpread,
  isIslandClause,
  isNamedTypeExpr,
  isObjectField,
  isProjectionClause,
  isProjectionWhenArm,
  isResourceConstruction,
  isResourceDeclaration,
  isScalarDeclaration,
  isTypedField,
  isTypeProjection,
  type ObjectField,
  type TypedField,
} from "../lang/generated/ast";
import { hoverMarkdownForExprPath } from "./hover-expr";
import {
  collectFragmentTable,
  fragmentHoverMarkdownFor,
  lookupFragmentHoverMarkdown,
} from "./hover-fragment";
import {
  fieldHoverMarkdown,
  namedTypeHoverMarkdown,
  resourceFieldHoverMarkdown,
  resourceHoverMarkdown,
  scalarHoverMarkdown,
} from "./hover-markdown";
import type { SemanticSnapshot, SemanticSnapshotCache } from "./semantic-snapshot";

type HoverTables = {
  scalars: ScalarTable;
  resources: ResourceTable;
  documentsByUri?: ReadonlyMap<string, LangiumDocument>;
};

function nameTablesFrom(tables: HoverTables): NameTables {
  return {
    scalars: new Set(tables.scalars.keys()),
    resources: new Set(tables.resources.keys()),
  };
}

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

function identityFieldsForResource(
  resourceName: string | undefined,
  resources: ResourceTable
): FieldDecl[] | null {
  if (!resourceName) return null;
  const symbols = resources.get(resourceName);
  if (!symbols) return null;
  return [...symbols.identity.values()];
}

function typeOfTypedOrObjectField(node: TypedField | ObjectField, tables: HoverTables): TypeExpr {
  const names = nameTablesFrom(tables);
  if (isTypedField(node)) {
    const resourceDecl = AstUtils.getContainerOfType(node, isResourceDeclaration);
    if (resourceDecl) {
      const symbols = tables.resources.get(resourceDecl.name);
      const fromTable = symbols?.identity.get(node.name) ?? symbols?.payload.get(node.name);
      if (fromTable) {
        return fromTable.type;
      }
    }
    return lowerTypedField(node, names).type;
  }

  const resourceDecl = AstUtils.getContainerOfType(node, isResourceDeclaration);
  if (resourceDecl) {
    const symbols = tables.resources.get(resourceDecl.name);
    if (
      symbols &&
      node.$container.$type === "ObjectTypeExpr" &&
      node.$container.$container === resourceDecl
    ) {
      const fromTable = symbols.payload.get(node.name) ?? symbols.identity.get(node.name);
      if (fromTable) {
        return fromTable.type;
      }
    }
  }

  return lowerObjectField(
    node,
    names,
    identityFieldsForResource(resourceDecl?.name, tables.resources)
  ).type;
}

function hoverForSelectedField(
  resourceName: string,
  fieldName: string,
  tables: HoverTables
): string | undefined {
  return resourceFieldHoverMarkdown(resourceName, fieldName, tables.resources);
}

function hoverForResourceName(name: string, tables: HoverTables): string | undefined {
  const symbols = tables.resources.get(name);
  return symbols ? resourceHoverMarkdown(name, symbols) : undefined;
}

/**
 * Build hover markdown for the AST / CST at `offset`.
 * Exported for unit tests (no full LSP harness).
 */
export function hoverMarkdownAtOffset(
  document: LangiumDocument,
  offset: number,
  tables: HoverTables,
  nameRegexp = /^[_a-zA-Z][\w_]*$/
): string | undefined {
  const root = document.parseResult?.value?.$cstNode;
  if (!root) return undefined;

  const leaf = CstUtils.findDeclarationNodeAtOffset(root, offset, nameRegexp);
  if (!leaf || leaf.offset + leaf.length <= offset) {
    return undefined;
  }

  return hoverMarkdownForCstLeaf(leaf, tables);
}

export function hoverMarkdownForCstLeaf(leaf: CstNode, tables: HoverTables): string | undefined {
  const node = leaf.astNode;
  const text = leaf.text;
  const feature = assignmentFeature(leaf);

  // Expression paths first — PathRef / IdentityRef / ContextRef (incl. nested).
  const exprHover = hoverMarkdownForExprPath(leaf, feature, {
    resources: tables.resources,
    scalars: tables.scalars,
    nameTables: nameTablesFrom(tables),
  });
  if (exprHover) {
    return exprHover;
  }

  if (isFragmentDeclaration(node)) {
    if (feature === "name" || node.name === text) {
      const fragments = collectFragmentTable(node, tables.documentsByUri);
      return fragmentHoverMarkdownFor(node, fragments, tables.resources);
    }
    if (feature === "resource" || node.resource === text) {
      return hoverForResourceName(node.resource, tables);
    }
    if (feature === "selectedFields" || node.selectedFields.includes(text)) {
      return hoverForSelectedField(node.resource, text, tables);
    }
    if (feature === "binding" || node.binding === text) {
      return hoverForResourceName(node.resource, tables);
    }
  }

  if (isFragmentSpread(node) && (feature === "name" || node.name === text)) {
    return lookupFragmentHoverMarkdown(node.name, node, tables.resources, tables.documentsByUri);
  }

  if (isNamedTypeExpr(node) && (feature === "name" || feature === undefined)) {
    return namedTypeHoverMarkdown(node.name, tables.scalars, tables.resources);
  }

  if (isScalarDeclaration(node) && (feature === "name" || node.name === text)) {
    const scalar = tables.scalars.get(node.name);
    if (scalar) {
      return scalarHoverMarkdown(scalar.name, scalar.representation);
    }
    return scalarHoverMarkdown(node.name, node.representation);
  }

  if (isResourceDeclaration(node) && (feature === "name" || node.name === text)) {
    return hoverForResourceName(node.name, tables);
  }

  if (isResourceConstruction(node) && (feature === "resource" || node.resource === text)) {
    return hoverForResourceName(node.resource, tables);
  }

  if (isTypeProjection(node)) {
    if (feature === "resource" || (feature === undefined && node.resource === text)) {
      return hoverForResourceName(node.resource, tables);
    }
    if (feature === "field" || (feature === undefined && node.field === text)) {
      return hoverForSelectedField(node.resource, node.field, tables);
    }
  }

  if (isProjectionClause(node)) {
    if (feature === "resource" || node.resource === text) {
      return hoverForResourceName(node.resource, tables);
    }
    if (feature === "selectedFields" || node.selectedFields.includes(text)) {
      return hoverForSelectedField(node.resource, text, tables);
    }
  }

  if (isIslandClause(node)) {
    if (feature === "resource" || node.resource === text) {
      return hoverForResourceName(node.resource, tables);
    }
    if (feature === "binding" || (node.binding !== undefined && node.binding === text)) {
      return hoverForResourceName(node.resource, tables);
    }
  }

  if (isProjectionWhenArm(node)) {
    if (feature === "selectedFields" || node.selectedFields.includes(text)) {
      const resourceName = node.$container.resource;
      return hoverForSelectedField(resourceName, text, tables);
    }
  }

  if (isTypedField(node) || isObjectField(node)) {
    if (feature === "name" || feature === undefined || node.name === text) {
      if (node.name === text || feature === "name") {
        const optional = isObjectField(node) && node.optional === true;
        return fieldHoverMarkdown(node.name, typeOfTypedOrObjectField(node, tables), optional);
      }
    }
  }

  // Fallback: token text looks like a known scalar / resource / fragment name.
  if (feature === undefined || feature === "name" || feature === "resource") {
    const byName = namedTypeHoverMarkdown(text, tables.scalars, tables.resources);
    if (byName) return byName;
    const fragHover = lookupFragmentHoverMarkdown(
      text,
      node,
      tables.resources,
      tables.documentsByUri
    );
    if (fragHover) return fragHover;
  }

  if (feature === "selectedFields" || feature === undefined) {
    const resourceName = enclosingProjectionResource(node);
    if (resourceName) {
      const fieldHover = hoverForSelectedField(resourceName, text, tables);
      if (fieldHover) return fieldHover;
    }
  }

  return undefined;
}

export class ZielHoverProvider implements HoverProvider {
  constructor(
    private readonly services: LangiumServices,
    private readonly semanticSnapshot: SemanticSnapshotCache
  ) {}

  getHoverContent(document: LangiumDocument, params: HoverParams): Hover | undefined {
    const snapshot = this.semanticSnapshot.get();
    if (!snapshot) {
      return undefined;
    }

    const offset = document.textDocument.offsetAt(params.position);
    const nameRegexp = this.services.parser.GrammarConfig.nameRegexp;
    const markdown = hoverMarkdownAtOffset(document, offset, snapshot, nameRegexp);
    if (!markdown) {
      return undefined;
    }

    return {
      contents: {
        kind: "markdown",
        value: markdown,
      },
    };
  }
}

export type { SemanticSnapshot };
