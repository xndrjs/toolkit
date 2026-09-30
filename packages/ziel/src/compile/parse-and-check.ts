/** Single-source convenience pipeline: parse → lower → checkProgram. */
import { checkProgram, type Diagnostic } from "../check";
import { createDiagnosticSink } from "../check/diagnostic";
import type { Program } from "../ir";
import { lowerProgram } from "./lower";
import { parseSource } from "./parse-source";

const EMPTY_PROGRAM: Program = {
  scalars: [],
  resources: [],
  fragments: [],
  datasources: [],
  queries: [],
  span: null,
};

export type ParseAndCheckResult = {
  program: Program;
  diagnostics: Diagnostic[];
};

/**
 * Parse `.ziel` source, lower to IR, and run `checkProgram`.
 *
 * @param source - Ziel source text
 * @param uri - optional document URI (attached to CST spans via Langium)
 */
export function parseAndCheck(source: string, uri?: string): ParseAndCheckResult {
  const parsed = parseSource(source, uri);
  if (parsed.model === null) return { program: EMPTY_PROGRAM, diagnostics: parsed.diagnostics };

  const lowerSink = createDiagnosticSink();
  const program = lowerProgram(parsed.model, lowerSink);
  const diagnostics = [...lowerSink.diagnostics, ...checkProgram(program)];
  return { program, diagnostics };
}
