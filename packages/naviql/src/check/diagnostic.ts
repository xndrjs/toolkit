/**
 * Typechecker diagnostics. `path` is a dotted IR location for tests / tooling.
 * `span` points at the relevant IR / syntax range when available.
 */
import type { SourceSpan } from "../ir";

export type Diagnostic = {
  code: string;
  message: string;
  path?: string;
  /** Source range for editor squiggles; `null`/absent when unknown. */
  span?: SourceSpan | null;
};

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
