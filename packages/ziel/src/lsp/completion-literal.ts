/**
 * Completion for string-literal values inside comparison RHS quotes:
 * `e.kind == "…"` / `!=` / `in ("…")` / `not in ("…")`.
 *
 * Uses text recovery so an unclosed `"` still yields proposals (AST may be incomplete).
 */
import { CstUtils, type AstNode, type LangiumDocument } from "langium";
import { CompletionItemKind } from "vscode-languageserver";

import { createDiagnosticSink } from "../check/diagnostic";
import { resolveBindingPath, resolvePathOnItemType } from "../check/expr-paths";
import { unwrapNullable, type QueryScope, type ResourceTable } from "../check/symbols";
import type { TypeExpr } from "../ir";
import { buildExprScope, type ExprScopeTables } from "./expr-scope";

export type LiteralValueCompletion = {
  label: string;
  kind: CompletionItemKind;
  detail?: string;
};

export type LiteralCompareSite = {
  /** Payload / identity path segments including binding head (`e`, `kind`). */
  pathSegments: string[];
  /** True when the path is `@binding.…` (identity side). */
  identity: boolean;
  /** Characters typed inside the open string (may be empty). */
  partial: string;
  /** Absolute offset of the opening `"` (for scope leaf lookup). */
  quoteOffset: number;
};

/**
 * Detect cursor inside an open string RHS of `==` / `!=` / `in` / `not in`
 * with a simple path LHS (`e.kind`, `@e.id`, …).
 */
export function parseTrailingLiteralCompare(
  text: string,
  offset: number
): LiteralCompareSite | undefined {
  const before = text.slice(0, offset);

  // path == "partial   |  path != "partial
  const eq = /((?:@)?[_a-zA-Z][\w_]*(?:\.[_a-zA-Z][\w_]*)*)\s*(==|!=)\s*"([^"]*)$/.exec(before);
  if (eq) {
    return siteFromMatch(eq[1]!, eq[3] ?? "", before.length - (eq[3]?.length ?? 0) - 1);
  }

  // path in ("a", "partial   |  path not in ("partial
  const inn =
    /((?:@)?[_a-zA-Z][\w_]*(?:\.[_a-zA-Z][\w_]*)*)\s+(?:not\s+)?in\s*\(\s*(?:"[^"]*"\s*,\s*)*"([^"]*)$/.exec(
      before
    );
  if (inn) {
    return siteFromMatch(inn[1]!, inn[2] ?? "", before.length - (inn[2]?.length ?? 0) - 1);
  }

  return undefined;
}

function siteFromMatch(rawPath: string, partial: string, quoteOffset: number): LiteralCompareSite {
  const identity = rawPath.startsWith("@");
  const path = identity ? rawPath.slice(1) : rawPath;
  return {
    pathSegments: path.split(".").filter(Boolean),
    identity,
    partial,
    quoteOffset,
  };
}

/** Collect distinct string-literal values from a (possibly union) type. */
export function collectStringLiteralValues(type: TypeExpr): string[] {
  const unwrapped = unwrapNullable(type);
  if (unwrapped.kind === "stringLiteral") {
    return [unwrapped.value];
  }
  if (unwrapped.kind === "union") {
    const values: string[] = [];
    const seen = new Set<string>();
    for (const member of unwrapped.members) {
      for (const v of collectStringLiteralValues(member)) {
        if (!seen.has(v)) {
          seen.add(v);
          values.push(v);
        }
      }
    }
    return values;
  }
  return [];
}

function resolveCompareLhsType(
  site: LiteralCompareSite,
  scope: QueryScope,
  resources: ResourceTable
): TypeExpr | undefined {
  const segments = site.pathSegments;
  if (segments.length === 0) return undefined;

  const [head, ...rest] = segments;
  if (!head) return undefined;

  const sink = createDiagnosticSink();

  if (site.identity) {
    return resolveBindingPath(head, rest, "identity", "completion", null, scope, resources, sink);
  }

  if (scope.items.has(head)) {
    const itemType = scope.items.get(head)!;
    if (rest.length === 0) return itemType;
    return resolvePathOnItemType(rest, itemType, "completion", null, sink);
  }

  if (scope.bindings.has(head)) {
    if (rest.length === 0) {
      // Bare binding — not a field; no literal values.
      return undefined;
    }
    return resolveBindingPath(head, rest, "payload", "completion", null, scope, resources, sink);
  }

  return undefined;
}

function matchesPartial(label: string, partial: string): boolean {
  if (!partial) return true;
  return label.toLowerCase().startsWith(partial.toLowerCase());
}

/**
 * String-literal value completions at `offset`.
 * Returns `undefined` when the cursor is not inside a comparison string RHS.
 */
export function literalCompletionsAtOffset(
  document: LangiumDocument,
  offset: number,
  tables: ExprScopeTables
): LiteralValueCompletion[] | undefined {
  const text = document.textDocument.getText();
  const site = parseTrailingLiteralCompare(text, offset);
  if (!site) return undefined;

  const root = document.parseResult?.value?.$cstNode;
  if (!root) return undefined;

  // Prefer a leaf on the LHS / before the quote so scope survives an unclosed string.
  const leaf =
    CstUtils.findLeafNodeBeforeOffset(root, Math.max(0, site.quoteOffset - 1)) ??
    CstUtils.findLeafNodeBeforeOffset(root, offset) ??
    CstUtils.findDeclarationNodeAtOffset(root, offset);
  const node: AstNode | undefined = leaf?.astNode ?? document.parseResult?.value;
  if (!node) return undefined;

  const scope = buildExprScope(node, tables);
  const lhsType = resolveCompareLhsType(site, scope, tables.resources);
  if (!lhsType) return [];

  const values = collectStringLiteralValues(lhsType);
  if (values.length === 0) return [];

  return values
    .filter((v) => matchesPartial(v, site.partial))
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({
      label: value,
      kind: CompletionItemKind.EnumMember,
      detail: `"${value}"`,
    }));
}
