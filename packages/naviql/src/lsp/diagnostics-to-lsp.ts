/**
 * Convert checker {@link Diagnostic} values to LSP diagnostics with ranges.
 */
import {
  DiagnosticSeverity,
  type Diagnostic as LspDiagnostic,
  type Position,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { Diagnostic } from "../check";

export type PositionAt = (offset: number) => Position;

/**
 * Map a single NaviQL diagnostic to an LSP diagnostic.
 * Offsets come from {@link Diagnostic.span}; missing spans fall back to `[0,0]`.
 */
export function diagnosticToLsp(diagnostic: Diagnostic, positionAt: PositionAt): LspDiagnostic {
  const startOffset = diagnostic.span?.start ?? 0;
  const endOffset = Math.max(diagnostic.span?.end ?? startOffset, startOffset);
  return {
    severity: DiagnosticSeverity.Error,
    range: {
      start: positionAt(startOffset),
      end: positionAt(endOffset),
    },
    message: diagnostic.message,
    code: diagnostic.code,
    source: "naviql",
  };
}

/**
 * Convert diagnostics using offsets against `source` text (creates a transient TextDocument).
 */
export function diagnosticsToLsp(
  diagnostics: Diagnostic[],
  uri: string,
  source: string
): LspDiagnostic[] {
  const doc = TextDocument.create(uri, "naviql", 0, source);
  return diagnostics.map((d) => diagnosticToLsp(d, (offset) => doc.positionAt(offset)));
}
