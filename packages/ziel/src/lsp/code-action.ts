/**
 * Ziel CodeActionProvider — quick fixes for checker diagnostics.
 * - MISSING_ON_PROJECTION → insert stub `on R b include properties { }`
 * - MISSING_CONTEXT → insert empty `context { }`
 * - EMPTY_ROOTS → insert empty `roots { }`
 * - QUERY_CONTEXT_MISSING_DATASOURCE_FIELD → add param (if needed) + projection entry
 * - QUERY_CONTEXT_UNUSED_FIELD → remove projection entry
 */
import { AstUtils, CstUtils, type LangiumDocument } from "langium";
import type { CodeActionProvider, LangiumServices } from "langium/lsp";
import type {
  CodeAction,
  CodeActionParams,
  Command,
  Diagnostic,
  TextEdit,
} from "vscode-languageserver";
import { CodeActionKind } from "vscode-languageserver";

import { formatType } from "../check/assignability";
import { requiredQueryContextFields } from "../check/check-datasources";
import type { FieldDecl, QueryDefinition, TypeExpr } from "../ir";
import { isQueryDeclaration, type QueryDeclaration } from "../lang/generated/ast";
import type { SemanticSnapshot, SemanticSnapshotCache } from "./semantic-snapshot";

const MISSING_ON_CODE = "MISSING_ON_PROJECTION";
const MISSING_CONTEXT_CODE = "MISSING_CONTEXT";
const EMPTY_ROOTS_CODE = "EMPTY_ROOTS";
const QUERY_CONTEXT_MISSING_CODE = "QUERY_CONTEXT_MISSING_DATASOURCE_FIELD";
const QUERY_CONTEXT_UNUSED_CODE = "QUERY_CONTEXT_UNUSED_FIELD";

type MissingOnDiagnostic = Diagnostic & {
  data: { missingResource: string };
};

type ContextFieldDiagnostic = Diagnostic & {
  data: { contextField: string };
};

/** True when the LSP diagnostic carries structured `missingResource` data. */
export function isMissingOnDiagnostic(diagnostic: Diagnostic): diagnostic is MissingOnDiagnostic {
  if (diagnostic.code !== MISSING_ON_CODE) {
    return false;
  }
  const data = diagnostic.data as { missingResource?: unknown } | undefined;
  return typeof data?.missingResource === "string" && data.missingResource.length > 0;
}

export function isMissingContextDiagnostic(diagnostic: Diagnostic): boolean {
  return diagnostic.code === MISSING_CONTEXT_CODE;
}

export function isEmptyRootsDiagnostic(diagnostic: Diagnostic): boolean {
  return diagnostic.code === EMPTY_ROOTS_CODE;
}

export function isQueryContextMissingDiagnostic(
  diagnostic: Diagnostic
): diagnostic is ContextFieldDiagnostic {
  if (diagnostic.code !== QUERY_CONTEXT_MISSING_CODE) {
    return false;
  }
  const data = diagnostic.data as { contextField?: unknown } | undefined;
  return typeof data?.contextField === "string" && data.contextField.length > 0;
}

export function isQueryContextUnusedDiagnostic(
  diagnostic: Diagnostic
): diagnostic is ContextFieldDiagnostic {
  if (diagnostic.code !== QUERY_CONTEXT_UNUSED_CODE) {
    return false;
  }
  const data = diagnostic.data as { contextField?: unknown } | undefined;
  return typeof data?.contextField === "string" && data.contextField.length > 0;
}

/**
 * Prefer the resource's first letter lowercased (`Asset` → `a`).
 * If taken, try camelCase (`asset`); then `${first}${n}` (`a2`, `a3`, …).
 */
export function uniqueProjectionBinding(
  resourceName: string,
  usedBindings: ReadonlySet<string>
): string {
  const first = resourceName.charAt(0).toLowerCase();
  if (first.length > 0 && !usedBindings.has(first)) {
    return first;
  }
  const camel = first + resourceName.slice(1);
  if (camel.length > 0 && !usedBindings.has(camel)) {
    return camel;
  }
  let n = 2;
  while (usedBindings.has(`${first}${n}`)) {
    n++;
  }
  return `${first}${n}`;
}

/** One stub line matching the demo convention (`on Asset a include properties { }`). */
export function missingOnStubLine(resourceName: string, binding: string): string {
  return `  on ${resourceName} ${binding} include properties { }`;
}

/**
 * Text inserted before `islands {` or the query's closing `}`.
 * Always ends with a trailing newline so the following line keeps its indent.
 */
export function missingOnInsertText(
  clauses: readonly { resource: string; binding: string }[]
): string {
  if (clauses.length === 0) {
    return "";
  }
  return `${clauses.map((c) => missingOnStubLine(c.resource, c.binding)).join("\n\n")}\n\n`;
}

/** Empty context block stub. */
export function missingContextInsertText(): string {
  return `  context { }\n\n`;
}

/** Empty multi-root block stub (entries filled in by the author). */
export function emptyRootsInsertText(): string {
  return `  roots { }\n\n`;
}

/** Bindings already claimed by projections / island clauses in the query. */
export function usedBindingsInQuery(
  query: QueryDeclaration,
  ir: QueryDefinition | undefined
): Set<string> {
  if (ir) {
    const used = new Set(ir.projections.map((p) => p.binding));
    for (const island of ir.islands) {
      if (island.binding) {
        used.add(island.binding);
      }
    }
    return used;
  }
  const used = new Set(query.projections.map((p) => p.binding));
  for (const clause of query.islands?.clauses ?? []) {
    if (clause.binding) {
      used.add(clause.binding);
    }
  }
  return used;
}

/**
 * Offset just after the query body's opening `{` (and its newline, if any).
 * Exported for unit tests.
 */
export function queryBodyOpenInsertOffset(
  query: QueryDeclaration,
  source: string
): number | undefined {
  const queryCst = query.$cstNode;
  if (!queryCst) {
    return undefined;
  }
  const open = source.indexOf("{", queryCst.offset);
  if (open < 0 || open >= queryCst.end) {
    return undefined;
  }
  let i = open + 1;
  if (source[i] === "\r") {
    i++;
  }
  if (source[i] === "\n") {
    i++;
  }
  return i;
}

/**
 * Offset for inserting a missing `context { }` — right after the query `{`.
 */
export function missingContextInsertOffset(
  query: QueryDeclaration,
  source: string
): number | undefined {
  return queryBodyOpenInsertOffset(query, source);
}

/**
 * Offset for inserting a default `root` — after `context` when present, else
 * after the query `{`, and before projections / islands / closing `}`.
 */
export function missingRootInsertOffset(
  query: QueryDeclaration,
  source: string
): number | undefined {
  const contextCst = query.context?.$cstNode;
  if (contextCst) {
    let i = contextCst.end;
    if (source[i] === "\r") {
      i++;
    }
    if (source[i] === "\n") {
      i++;
    }
    return i;
  }

  const firstProjection = query.projections[0]?.$cstNode;
  if (firstProjection) {
    return lineStartOffset(source, firstProjection.offset);
  }

  const islandsCst = query.islands?.$cstNode;
  if (islandsCst) {
    return lineStartOffset(source, islandsCst.offset);
  }

  return queryBodyOpenInsertOffset(query, source);
}

/**
 * Offset at the start of the `islands` line when present, else at the query's
 * closing `}`. Exported for unit tests.
 */
export function missingOnInsertOffset(query: QueryDeclaration, source: string): number | undefined {
  const islandsCst = query.islands?.$cstNode;
  if (islandsCst) {
    return lineStartOffset(source, islandsCst.offset);
  }
  const queryCst = query.$cstNode;
  if (!queryCst) {
    return undefined;
  }
  // Query CST ends after `}`; insert just before that brace.
  return queryCst.end - 1;
}

function lineStartOffset(source: string, offset: number): number {
  let i = offset;
  while (i > 0 && source[i - 1] !== "\n") {
    i--;
  }
  return i;
}

function queryAtOffset(document: LangiumDocument, offset: number): QueryDeclaration | undefined {
  const root = document.parseResult?.value?.$cstNode;
  if (!root) {
    return undefined;
  }
  const leaf = CstUtils.findLeafNodeAtOffset(root, offset);
  const astNode = leaf?.astNode;
  if (!astNode) {
    return undefined;
  }
  return AstUtils.getContainerOfType(astNode, isQueryDeclaration);
}

function queryIr(
  query: QueryDeclaration,
  snapshot: SemanticSnapshot | undefined
): QueryDefinition | undefined {
  return snapshot?.program.queries.find((q) => q.name === query.name);
}

function allocateBindings(
  resourceNames: readonly string[],
  used: Set<string>
): { resource: string; binding: string }[] {
  const clauses: { resource: string; binding: string }[] = [];
  for (const resource of resourceNames) {
    const binding = uniqueProjectionBinding(resource, used);
    used.add(binding);
    clauses.push({ resource, binding });
  }
  return clauses;
}

function textEditAt(document: LangiumDocument, offset: number, newText: string): TextEdit {
  const position = document.textDocument.positionAt(offset);
  return {
    range: { start: position, end: position },
    newText,
  };
}

function quickFix(
  title: string,
  diagnostics: Diagnostic[],
  uri: string,
  edits: TextEdit[]
): CodeAction {
  return {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics,
    edit: {
      changes: {
        [uri]: edits,
      },
    },
  };
}

/**
 * Build insert edits for missing `on` resources in a single query.
 * Returns `undefined` when the query CST cannot locate an insert site.
 */
export function missingOnEditsForQuery(
  document: LangiumDocument,
  query: QueryDeclaration,
  resourceNames: readonly string[],
  snapshot: SemanticSnapshot | undefined
): { edits: TextEdit[]; clauses: { resource: string; binding: string }[] } | undefined {
  if (resourceNames.length === 0) {
    return undefined;
  }
  const source = document.textDocument.getText();
  const offset = missingOnInsertOffset(query, source);
  if (offset === undefined) {
    return undefined;
  }
  const used = usedBindingsInQuery(query, queryIr(query, snapshot));
  const clauses = allocateBindings(resourceNames, used);
  const newText = missingOnInsertText(clauses);
  return { edits: [textEditAt(document, offset, newText)], clauses };
}

/** Insert empty `context { }` after the query body's `{`. */
export function missingContextEditsForQuery(
  document: LangiumDocument,
  query: QueryDeclaration
): TextEdit[] | undefined {
  if (query.context) {
    return undefined;
  }
  const source = document.textDocument.getText();
  const offset = missingContextInsertOffset(query, source);
  if (offset === undefined) {
    return undefined;
  }
  return [textEditAt(document, offset, missingContextInsertText())];
}

/** Insert `roots { }` after context / at the query body start. */
export function missingRootEditsForQuery(
  document: LangiumDocument,
  query: QueryDeclaration
): TextEdit[] | undefined {
  if (query.root || query.roots) {
    return undefined;
  }
  const source = document.textDocument.getText();
  const offset = missingRootInsertOffset(query, source);
  if (offset === undefined) {
    return undefined;
  }
  return [textEditAt(document, offset, emptyRootsInsertText())];
}

/** Print a type for insertion into `.ziel` source (scalar / primitive / simple shapes). */
export function zielTypeSource(type: TypeExpr): string {
  return formatType(type);
}

/**
 * Offset just before the closing `}` of `query.context`, after the last projection
 * (or after `{` when empty).
 */
export function contextProjectionInsertOffset(
  query: QueryDeclaration,
  source: string
): number | undefined {
  const block = query.context;
  if (!block?.$cstNode) {
    return undefined;
  }
  const last = block.projections[block.projections.length - 1];
  if (last?.$cstNode) {
    let i = last.$cstNode.end;
    if (source[i] === "\r") i++;
    if (source[i] === "\n") i++;
    return i;
  }
  // Empty `context { }` — insert after `{` newline if present.
  const open = block.$cstNode;
  const text = source.slice(open.offset, open.end);
  const brace = text.indexOf("{");
  if (brace < 0) return undefined;
  let i = open.offset + brace + 1;
  if (source[i] === "\r") i++;
  if (source[i] === "\n") i++;
  return i;
}

/** Offset to insert a new parameter before the closing `)` of the query signature. */
export function queryParamInsertOffset(query: QueryDeclaration): number | undefined {
  const cst = query.$cstNode;
  if (!cst) return undefined;
  // Find the `)` that closes the parameter list — first `)` after `query Name`.
  const text = cst.text;
  const open = text.indexOf("(");
  if (open < 0) return undefined;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        return cst.offset + i;
      }
    }
  }
  return undefined;
}

/**
 * Edits to add a missing context projection field (and param if absent).
 * Uses required DS field type from the snapshot program when adding a param.
 */
export function addContextFieldEditsForQuery(
  document: LangiumDocument,
  query: QueryDeclaration,
  contextField: string,
  snapshot: SemanticSnapshot | undefined
): TextEdit[] | undefined {
  const source = document.textDocument.getText();
  const edits: TextEdit[] = [];
  const existingParams = new Set(query.parameters.map((p) => p.name));
  const existingProjections = new Set((query.context?.projections ?? []).map((p) => p.contextName));

  if (existingProjections.has(contextField)) {
    return undefined;
  }

  // Ensure context block exists first (insert at body start).
  if (!query.context) {
    const ctxEdits = missingContextEditsForQuery(document, query);
    if (!ctxEdits) return undefined;
    edits.push(...ctxEdits);
  }

  if (!existingParams.has(contextField)) {
    const ir = queryIr(query, snapshot);
    let fieldType: FieldDecl | undefined;
    if (snapshot && ir) {
      fieldType = requiredQueryContextFields(snapshot.program, ir).fields.get(contextField);
    }
    const typeSrc = fieldType ? zielTypeSource(fieldType.type) : "string";
    const paramOffset = queryParamInsertOffset(query);
    if (paramOffset === undefined) return undefined;
    const needsComma = query.parameters.length > 0;
    const insertion = needsComma ? `, ${contextField}: ${typeSrc}` : `${contextField}: ${typeSrc}`;
    edits.push(textEditAt(document, paramOffset, insertion));
  }

  // Re-resolve context block after potential empty insert is awkward in one shot —
  // if we just inserted empty context, query.context is still undefined on AST.
  // Insert projection into existing block, or into the freshly inserted stub via
  // a combined edit when block was missing.
  if (query.context) {
    const insertAt = contextProjectionInsertOffset(query, source);
    if (insertAt === undefined) return undefined;
    edits.push(textEditAt(document, insertAt, `    ${contextField}\n`));
  } else {
    // Replace empty `context { }\n\n` we queued with a populated block.
    const ctxEdit = edits.find((e) => e.newText === missingContextInsertText());
    if (ctxEdit) {
      ctxEdit.newText = `  context {\n    ${contextField}\n  }\n\n`;
    }
  }

  // Apply later offsets first so earlier inserts stay valid when multiple edits.
  return edits.sort(
    (a, b) =>
      document.textDocument.offsetAt(b.range.start) - document.textDocument.offsetAt(a.range.start)
  );
}

/** Delete a single unused `ContextProjectionEntry` (and following newline). */
export function removeContextFieldEditsForQuery(
  document: LangiumDocument,
  query: QueryDeclaration,
  contextField: string
): TextEdit[] | undefined {
  const entry = query.context?.projections.find((p) => p.contextName === contextField);
  const cst = entry?.$cstNode;
  if (!cst) return undefined;
  const source = document.textDocument.getText();
  let end = cst.end;
  if (source[end] === "\r") end++;
  if (source[end] === "\n") end++;
  const startPos = document.textDocument.positionAt(cst.offset);
  const endPos = document.textDocument.positionAt(end);
  return [
    {
      range: { start: startPos, end: endPos },
      newText: "",
    },
  ];
}

export class ZielCodeActionProvider implements CodeActionProvider {
  constructor(
    _services: LangiumServices,
    private readonly semanticSnapshot: SemanticSnapshotCache
  ) {}

  getCodeActions(
    document: LangiumDocument,
    params: CodeActionParams
  ): (Command | CodeAction)[] | undefined {
    const snapshot = this.semanticSnapshot.get();
    const uri = document.textDocument.uri;
    const actions: CodeAction[] = [];

    const missingOn = params.context.diagnostics.filter(isMissingOnDiagnostic);
    const missingContext = params.context.diagnostics.filter(isMissingContextDiagnostic);
    const emptyRoots = params.context.diagnostics.filter(isEmptyRootsDiagnostic);

    for (const diagnostic of missingOn) {
      const offset = document.textDocument.offsetAt(diagnostic.range.start);
      const query = queryAtOffset(document, offset);
      if (!query) {
        continue;
      }
      const built = missingOnEditsForQuery(
        document,
        query,
        [diagnostic.data.missingResource],
        snapshot
      );
      if (!built) {
        continue;
      }
      actions.push(
        quickFix(
          `Add 'on ${diagnostic.data.missingResource}' projection`,
          [diagnostic],
          uri,
          built.edits
        )
      );
    }

    if (missingOn.length > 1) {
      const byQuery = new Map<
        QueryDeclaration,
        { diagnostics: MissingOnDiagnostic[]; resources: string[] }
      >();

      for (const diagnostic of missingOn) {
        const offset = document.textDocument.offsetAt(diagnostic.range.start);
        const query = queryAtOffset(document, offset);
        if (!query) {
          continue;
        }
        let group = byQuery.get(query);
        if (!group) {
          group = { diagnostics: [], resources: [] };
          byQuery.set(query, group);
        }
        group.diagnostics.push(diagnostic);
        if (!group.resources.includes(diagnostic.data.missingResource)) {
          group.resources.push(diagnostic.data.missingResource);
        }
      }

      const allEdits: TextEdit[] = [];
      const allDiagnostics: Diagnostic[] = [];
      // Apply from later offsets first so earlier inserts stay valid.
      const groups = [...byQuery.entries()].sort((a, b) => {
        const aOff = missingOnInsertOffset(a[0], document.textDocument.getText()) ?? 0;
        const bOff = missingOnInsertOffset(b[0], document.textDocument.getText()) ?? 0;
        return bOff - aOff;
      });

      for (const [query, group] of groups) {
        const built = missingOnEditsForQuery(document, query, group.resources, snapshot);
        if (!built) {
          continue;
        }
        allEdits.push(...built.edits);
        allDiagnostics.push(...group.diagnostics);
      }

      if (allEdits.length > 0) {
        actions.push(quickFix("Add all missing on projections", allDiagnostics, uri, allEdits));
      }
    }

    for (const diagnostic of missingContext) {
      const offset = document.textDocument.offsetAt(diagnostic.range.start);
      const query = queryAtOffset(document, offset);
      if (!query) {
        continue;
      }
      const edits = missingContextEditsForQuery(document, query);
      if (!edits) {
        continue;
      }
      actions.push(quickFix("Add empty context", [diagnostic], uri, edits));
    }

    for (const diagnostic of emptyRoots) {
      const offset = document.textDocument.offsetAt(diagnostic.range.start);
      const query = queryAtOffset(document, offset);
      if (!query) {
        continue;
      }
      const edits = missingRootEditsForQuery(document, query);
      if (!edits) {
        continue;
      }
      actions.push(quickFix("Add empty roots block", [diagnostic], uri, edits));
    }

    const missingContextFields = params.context.diagnostics.filter(isQueryContextMissingDiagnostic);
    for (const diagnostic of missingContextFields) {
      const offset = document.textDocument.offsetAt(diagnostic.range.start);
      const query = queryAtOffset(document, offset);
      if (!query) {
        continue;
      }
      const edits = addContextFieldEditsForQuery(
        document,
        query,
        diagnostic.data.contextField,
        snapshot
      );
      if (!edits || edits.length === 0) {
        continue;
      }
      actions.push(
        quickFix(`Add context field '${diagnostic.data.contextField}'`, [diagnostic], uri, edits)
      );
    }

    const unusedContextFields = params.context.diagnostics.filter(isQueryContextUnusedDiagnostic);
    for (const diagnostic of unusedContextFields) {
      const offset = document.textDocument.offsetAt(diagnostic.range.start);
      const query = queryAtOffset(document, offset);
      if (!query) {
        continue;
      }
      const edits = removeContextFieldEditsForQuery(document, query, diagnostic.data.contextField);
      if (!edits) {
        continue;
      }
      actions.push(
        quickFix(
          `Remove unused context field '${diagnostic.data.contextField}'`,
          [diagnostic],
          uri,
          edits
        )
      );
    }

    return actions.length > 0 ? actions : undefined;
  }
}
