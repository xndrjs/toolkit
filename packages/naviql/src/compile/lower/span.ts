import { AstUtils, type AstNode } from "langium";

import type { SourceSpan } from "../../ir";

export function spanOf(node: AstNode): SourceSpan | null {
  const cst = node.$cstNode;
  if (!cst) return null;

  let uri: string | null = null;
  try {
    uri = AstUtils.getDocument(node).uri.toString();
  } catch {
    uri = null;
  }

  return {
    start: cst.offset,
    end: cst.end,
    uri,
  };
}
