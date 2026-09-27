/**
 * Fragment hover: declaration name, spreads (`...EntryBase`), projected field shape.
 */
import { AstUtils, type AstNode, type LangiumDocument } from "langium";

import { createDiagnosticSink } from "../check/diagnostic";
import { narrowPayloadByFilter } from "../check/discriminants";
import { normalizeIncludeMode, resolveSelectedFields } from "../check/projection-include";
import type { ResourceTable } from "../check/symbols";
import { expandBody, lowerEnclosingWhen, type FragmentTable } from "../compile/lower/fragments";
import type { TypeExpr } from "../ir";
import { isFragmentDeclaration, isModel, type FragmentDeclaration } from "../lang/generated/ast";
import { fragmentHoverMarkdown, projectedFieldsType } from "./hover-markdown";

/** Gather fragment decls from the hovered doc and optional workspace snapshot docs. */
export function collectFragmentTable(
  fromNode: AstNode,
  documentsByUri?: ReadonlyMap<string, LangiumDocument>
): FragmentTable {
  const table: FragmentTable = new Map();

  const addModel = (root: unknown): void => {
    if (!isModel(root)) return;
    for (const decl of root.declarations) {
      if (isFragmentDeclaration(decl)) {
        table.set(decl.name, decl);
      }
    }
  };

  if (documentsByUri) {
    for (const doc of documentsByUri.values()) {
      addModel(doc.parseResult?.value);
    }
  }

  try {
    addModel(AstUtils.getDocument(fromNode).parseResult?.value);
  } catch {
    // in-memory / untethered nodes — fall back to container walk
    const model = AstUtils.getContainerOfType(fromNode, isModel);
    if (model) addModel(model);
  }

  return table;
}

/**
 * Flattened selected-field types for a fragment (includes nested spreads).
 * Returns `{ type: T, id: U, … }` shaped object type.
 *
 * Applies the fragment's own `include` / `when` the same way checkFragment does,
 * so hover matches effective projected fields after include resolution.
 */
export function fragmentProjectedType(
  frag: FragmentDeclaration,
  fragments: FragmentTable,
  resources: ResourceTable
): TypeExpr | undefined {
  const sink = createDiagnosticSink();
  const when = lowerEnclosingWhen(frag.when);
  const body = expandBody(
    frag,
    frag.resource,
    frag.binding,
    fragments,
    [frag.name],
    sink,
    resources,
    when
  );
  const payloadType = resources.get(frag.resource)?.payloadType;
  if (!payloadType) {
    return projectedFieldsType(body.selectedFields, frag.resource, resources);
  }
  const bodyPayload = when
    ? (narrowPayloadByFilter(payloadType, when, frag.binding, resources) ?? payloadType)
    : payloadType;
  const selectedFields = resolveSelectedFields(
    body.selectedFields,
    body.expansions,
    normalizeIncludeMode(frag.include),
    bodyPayload,
    resources,
    body.excludedFields
  );
  return projectedFieldsType(selectedFields, frag.resource, resources);
}

export function fragmentHoverMarkdownFor(
  frag: FragmentDeclaration,
  fragments: FragmentTable,
  resources: ResourceTable
): string | undefined {
  const projected = fragmentProjectedType(frag, fragments, resources);
  if (!projected) return undefined;
  return fragmentHoverMarkdown(frag.name, frag.resource, projected);
}

export function lookupFragmentHoverMarkdown(
  name: string,
  fromNode: AstNode,
  resources: ResourceTable,
  documentsByUri?: ReadonlyMap<string, LangiumDocument>
): string | undefined {
  const fragments = collectFragmentTable(fromNode, documentsByUri);
  const frag = fragments.get(name);
  if (!frag) return undefined;
  return fragmentHoverMarkdownFor(frag, fragments, resources);
}
