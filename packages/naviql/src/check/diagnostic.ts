/**
 * Typechecker diagnostics. `path` is a dotted IR location for tests / tooling.
 * Spans on IR nodes are ignored in phase 1.
 */
export type Diagnostic = {
  code: string;
  message: string;
  path?: string;
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
