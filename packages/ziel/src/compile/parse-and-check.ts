/**
 * Compile pipeline: Langium parse → lower → checkProgram.
 * Syntax errors become diagnostics (`SYNTAX_ERROR`); semantic errors never throw.
 */
import { URI } from "langium";

import { checkProgram, type Diagnostic } from "../check";
import { createDiagnosticSink } from "../check/diagnostic";
import type { Program, SourceSpan } from "../ir";
import { isModel, type Model } from "../lang/generated/ast";
import { createZielServices } from "../lang/ziel-module";
import { lowerProgram } from "./lower";

const EMPTY_PROGRAM: Program = {
  scalars: [],
  resources: [],
  fragments: [],
  datasources: [],
  queries: [],
  span: null,
};

const DEFAULT_URI = "inmemory:///ziel.ziel";

export type ParseAndCheckResult = {
  program: Program;
  diagnostics: Diagnostic[];
};

function syntaxSpan(uri: string, start: number, end: number): SourceSpan {
  return { start, end: Math.max(end, start), uri };
}

/**
 * Parse `.ziel` source, lower to IR, and run `checkProgram`.
 *
 * @param source - Ziel source text
 * @param uri - optional document URI (attached to CST spans via Langium)
 */
export function parseAndCheck(source: string, uri?: string): ParseAndCheckResult {
  const { shared } = createZielServices();
  const documentUri = URI.parse(uri ?? DEFAULT_URI);
  const documentUriString = documentUri.toString();
  const document = shared.workspace.LangiumDocumentFactory.fromString<Model>(source, documentUri);
  const { value, lexerErrors, parserErrors } = document.parseResult;

  const diagnostics: Diagnostic[] = [];

  for (const err of lexerErrors) {
    const start = err.offset;
    const end = start + Math.max(err.length, 1);
    diagnostics.push({
      code: "SYNTAX_ERROR",
      message: err.message,
      path: `offset:${start}`,
      span: syntaxSpan(documentUriString, start, end),
    });
  }

  for (const err of parserErrors) {
    const token = err.token;
    const startOffset = token?.startOffset;
    const hasStart = typeof startOffset === "number" && startOffset >= 0;
    const start = hasStart ? startOffset : 0;
    // Chevrotain `endOffset` is inclusive; SourceSpan.end is exclusive.
    const endOffset = token?.endOffset;
    const end =
      typeof endOffset === "number" && endOffset >= 0
        ? endOffset + 1
        : start + Math.max(token?.image?.length ?? 0, 1);
    diagnostics.push({
      code: "SYNTAX_ERROR",
      message: err.message,
      path: hasStart ? `offset:${start}` : undefined,
      span: syntaxSpan(documentUriString, start, end),
    });
  }

  if (!isModel(value)) {
    if (diagnostics.length === 0) {
      diagnostics.push({
        code: "SYNTAX_ERROR",
        message: "Expected a Ziel model",
        span: syntaxSpan(documentUriString, 0, source.length),
      });
    }
    return { program: EMPTY_PROGRAM, diagnostics };
  }

  // Incomplete trees from recovery are unsafe to lower; surface syntax only.
  if (diagnostics.length > 0) {
    return { program: EMPTY_PROGRAM, diagnostics };
  }

  const lowerSink = createDiagnosticSink();
  const program = lowerProgram(value, lowerSink);
  diagnostics.push(...lowerSink.diagnostics);
  diagnostics.push(...checkProgram(program));
  return { program, diagnostics };
}
