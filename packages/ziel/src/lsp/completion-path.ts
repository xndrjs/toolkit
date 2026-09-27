/**
 * Completion for expression property paths: `@p.`, `p.`, `context.`, item refs.
 */
import { CstUtils, type AstNode, type LangiumDocument } from "langium";
import { CompletionItemKind } from "vscode-languageserver";

import { formatType } from "../check/assignability";
import { createDiagnosticSink } from "../check/diagnostic";
import { expandPayloadObjectMembers } from "../check/discriminants";
import {
  resolveBindingPath,
  resolvePathOnFields,
  resolvePathOnItemType,
  resolvePathOnPayloadType,
} from "../check/expr-paths";
import {
  unwrapNullable,
  type FieldMap,
  type QueryScope,
  type ResourceTable,
} from "../check/symbols";
import type { TypeExpr } from "../ir";
import { buildExprScope, type ExprScopeTables } from "./expr-scope";

export type PathAccess =
  | {
      kind: "identity";
      binding: string;
      /** Segments already after the binding, before the partial being typed. */
      pathPrefix: string[];
      partial: string;
    }
  | {
      kind: "head";
      head: string;
      pathPrefix: string[];
      partial: string;
    };

export type PathFieldCompletion = {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
};

/** Field names on a payload (intersection across closed object unions). */
function selectableFieldNames(payloadType: TypeExpr, resources: ResourceTable): string[] {
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

/**
 * Parse a trailing property access before `offset`.
 * Matches `@p.`, `@p.id.`, `p.`, `p.meta.`, `context.locale`, `ref.id`, etc.
 */
export function parseTrailingPathAccess(text: string, offset: number): PathAccess | undefined {
  const before = text.slice(0, offset);
  // @binding(.seg)*.partial?
  const identity = /@([_a-zA-Z][\w_]*)((?:\.[_a-zA-Z][\w_]*)*)\.([\w_]*)$/.exec(before);
  if (identity) {
    return {
      kind: "identity",
      binding: identity[1]!,
      pathPrefix: splitPathDots(identity[2]!),
      partial: identity[3] ?? "",
    };
  }
  // head(.seg)*.partial?  — PathRef / ContextRef / item
  const head = /(?:^|[^@\w.])([_a-zA-Z][\w_]*)((?:\.[_a-zA-Z][\w_]*)*)\.([\w_]*)$/.exec(before);
  if (head) {
    return {
      kind: "head",
      head: head[1]!,
      pathPrefix: splitPathDots(head[2]!),
      partial: head[3] ?? "",
    };
  }
  return undefined;
}

function splitPathDots(dotted: string): string[] {
  if (!dotted) return [];
  return dotted.split(".").filter(Boolean);
}

function fieldMapCompletions(fields: FieldMap): PathFieldCompletion[] {
  return [...fields.values()].map((field) => ({
    label: field.name,
    kind: CompletionItemKind.Property,
    detail: formatType(field.type),
  }));
}

function fieldsOfType(type: TypeExpr, resources: ResourceTable): PathFieldCompletion[] {
  const unwrapped = unwrapNullable(type);
  if (unwrapped.kind === "object") {
    return unwrapped.fields.map((field) => ({
      label: field.name,
      kind: CompletionItemKind.Property,
      detail: formatType(field.type),
    }));
  }
  if (unwrapped.kind === "resourceRef") {
    const symbols = resources.get(unwrapped.name);
    if (!symbols) return [];
    return fieldsOfType(symbols.payloadType, resources);
  }
  if (unwrapped.kind === "union") {
    return selectableFieldNames(unwrapped, resources).map((name) => {
      const members = expandPayloadObjectMembers(unwrapped, resources) ?? [];
      const field = members.flatMap((m) => m.fields).find((f) => f.name === name);
      return {
        label: name,
        kind: CompletionItemKind.Property,
        detail: field ? formatType(field.type) : undefined,
      };
    });
  }
  return [];
}

function quietResolveBindingPath(
  binding: string,
  pathSegments: string[],
  side: "payload" | "identity",
  scope: QueryScope,
  resources: ResourceTable
): TypeExpr | undefined {
  if (pathSegments.length === 0) return undefined;
  const sink = createDiagnosticSink();
  return resolveBindingPath(
    binding,
    pathSegments,
    side,
    "completion",
    null,
    scope,
    resources,
    sink
  );
}

function quietResolvePathOnFields(
  pathSegments: string[],
  rootFields: FieldMap
): TypeExpr | undefined {
  if (pathSegments.length === 0) return undefined;
  const sink = createDiagnosticSink();
  return resolvePathOnFields(
    pathSegments,
    rootFields,
    "completion",
    "UNKNOWN_CONTEXT_PATH",
    "context",
    null,
    sink
  );
}

function quietResolveItemPath(pathSegments: string[], itemType: TypeExpr): TypeExpr | undefined {
  if (pathSegments.length === 0) return undefined;
  const sink = createDiagnosticSink();
  return resolvePathOnItemType(pathSegments, itemType, "completion", null, sink);
}

function quietResolvePayloadPath(
  pathSegments: string[],
  payloadType: TypeExpr,
  resources: ResourceTable
): TypeExpr | undefined {
  if (pathSegments.length === 0) return undefined;
  const sink = createDiagnosticSink();
  return resolvePathOnPayloadType(pathSegments, payloadType, "completion", null, resources, sink);
}

function payloadRootCompletions(
  binding: string,
  scope: QueryScope,
  resources: ResourceTable
): PathFieldCompletion[] {
  const resourceName = scope.bindings.get(binding);
  if (!resourceName) return [];
  const symbols = resources.get(resourceName);
  if (!symbols) return [];
  const payloadType = scope.payloadNarrowing.get(binding) ?? symbols.payloadType;
  return selectableFieldNames(payloadType, resources).map((name) => {
    const fromMap = symbols.payload.get(name)?.type;
    let detail: string | undefined = fromMap ? formatType(fromMap) : undefined;
    if (!detail) {
      const sunk = createDiagnosticSink();
      const t = resolvePathOnPayloadType([name], payloadType, "completion", null, resources, sunk);
      if (t) detail = formatType(t);
    }
    return { label: name, kind: CompletionItemKind.Property, detail };
  });
}

/** Field proposals for a parsed path access under `scope`. */
export function pathFieldCompletions(
  access: PathAccess,
  scope: QueryScope,
  resources: ResourceTable
): PathFieldCompletion[] {
  if (access.kind === "identity") {
    const resourceName = scope.bindings.get(access.binding);
    const symbols = resourceName ? resources.get(resourceName) : undefined;
    if (!symbols) return [];
    if (access.pathPrefix.length === 0) {
      return fieldMapCompletions(symbols.identity);
    }
    const t = quietResolveBindingPath(
      access.binding,
      access.pathPrefix,
      "identity",
      scope,
      resources
    );
    return t ? fieldsOfType(t, resources) : [];
  }

  const { head, pathPrefix } = access;

  if (head === "context") {
    if (pathPrefix.length === 0) return fieldMapCompletions(scope.context);
    const t = quietResolvePathOnFields(pathPrefix, scope.context);
    return t ? fieldsOfType(t, resources) : [];
  }

  if (scope.items.has(head)) {
    const itemType = scope.items.get(head)!;
    if (pathPrefix.length === 0) return fieldsOfType(itemType, resources);
    const t = quietResolveItemPath(pathPrefix, itemType);
    return t ? fieldsOfType(t, resources) : [];
  }

  if (scope.bindings.has(head)) {
    if (pathPrefix.length === 0) {
      return payloadRootCompletions(head, scope, resources);
    }
    const resourceName = scope.bindings.get(head)!;
    const symbols = resources.get(resourceName);
    if (!symbols) return [];
    const payloadType = scope.payloadNarrowing.get(head) ?? symbols.payloadType;
    const t = quietResolvePayloadPath(pathPrefix, payloadType, resources);
    return t ? fieldsOfType(t, resources) : [];
  }

  return [];
}

function matchesPartial(label: string, partial: string): boolean {
  if (!partial) return true;
  return label.toLowerCase().startsWith(partial.toLowerCase());
}

/**
 * Completions for `@p.` / `p.` / `context.` / item paths at `offset`.
 * Returns undefined when the cursor is not in a property-access position.
 */
export function pathCompletionsAtOffset(
  document: LangiumDocument,
  offset: number,
  tables: ExprScopeTables
): PathFieldCompletion[] | undefined {
  const text = document.textDocument.getText();
  const access = parseTrailingPathAccess(text, offset);
  if (!access) return undefined;

  const root = document.parseResult?.value?.$cstNode;
  if (!root) return undefined;

  const leaf =
    CstUtils.findLeafNodeBeforeOffset(root, offset) ??
    CstUtils.findDeclarationNodeAtOffset(root, offset);
  const node: AstNode | undefined = leaf?.astNode ?? document.parseResult?.value;
  if (!node) return undefined;

  const scope = buildExprScope(node, tables);

  if (access.kind === "identity") {
    if (!scope.bindings.has(access.binding)) return undefined;
  } else {
    const { head } = access;
    if (head !== "context" && !scope.bindings.has(head) && !scope.items.has(head)) {
      // e.g. TypeProjection `Entry.` — leave to other completion contexts.
      return undefined;
    }
  }

  const items = pathFieldCompletions(access, scope, tables.resources);
  return items.filter((item) => matchesPartial(item.label, access.partial));
}
