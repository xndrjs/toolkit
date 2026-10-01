/**
 * Typechecker diagnostics. `path` is a dotted IR location for tests / tooling.
 * `span` points at the relevant IR / syntax range when available.
 */
import type { SourceSpan } from "../ir";

export type DiagnosticSeverity = "error" | "warning";

export type Diagnostic = {
  code: string;
  message: string;
  path?: string;
  /** Source range for editor squiggles; `null`/absent when unknown. */
  span?: SourceSpan | null;
  /**
   * Defaults to `"error"`. Warnings do not block codegen; LSP maps them to Warning.
   */
  severity?: DiagnosticSeverity;
  /**
   * Structured payload for code actions / tooling (e.g. quick-fix resource name).
   * Forwarded as LSP `diagnostic.data` when present.
   */
  data?: { missingResource: string };
};

/** True when the diagnostic should fail compile / block codegen. */
export function isErrorDiagnostic(diagnostic: Pick<Diagnostic, "severity">): boolean {
  return diagnostic.severity !== "warning";
}

export type DiagnosticSink = {
  push(diagnostic: Diagnostic): void;
  diagnostics: Diagnostic[];
};

export function createDiagnosticSink(): DiagnosticSink {
  const diagnostics: Diagnostic[] = [];
  return {
    diagnostics,
    push(diagnostic) {
      diagnostics.push(diagnostic);
    },
  };
}
