import {
  analyzeProgram,
  type AnalyzeProgramOptions,
  type Diagnostic,
  type ProgramAnalysis,
} from "../check";
import { createDiagnosticSink } from "../check/diagnostic";
import type { Program } from "../ir";
import { lowerWorkspace } from "./lower";
import { createSourceParser } from "./parse-source";

export type WorkspaceSource = {
  uri: string;
  source: string;
};

export type CompileWorkspaceResult = {
  program: Program;
  diagnostics: Diagnostic[];
  syntaxDiagnostics: Diagnostic[];
  lowerDiagnostics: Diagnostic[];
  analysis: ProgramAnalysis;
  validSourceCount: number;
};

/** Parse all sources, lower them with global symbols, then analyze one merged program. */
export function compileWorkspace(
  sources: readonly WorkspaceSource[],
  options: AnalyzeProgramOptions = {}
): CompileWorkspaceResult {
  const parse = createSourceParser();
  const syntaxDiagnostics: Diagnostic[] = [];
  const models = [];

  for (const input of sources) {
    const parsed = parse(input.source, input.uri);
    syntaxDiagnostics.push(...parsed.diagnostics);
    if (parsed.model !== null) models.push(parsed.model);
  }

  const lowerSink = createDiagnosticSink();
  const program = lowerWorkspace(models, lowerSink);
  const lowerDiagnostics = [...lowerSink.diagnostics];
  const analysis = analyzeProgram(program, options);

  return {
    program,
    diagnostics: [...syntaxDiagnostics, ...lowerDiagnostics, ...analysis.diagnostics],
    syntaxDiagnostics,
    lowerDiagnostics,
    analysis,
    validSourceCount: models.length,
  };
}
