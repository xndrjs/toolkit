/**
 * Compile pipeline: Langium parse → lower → checkProgram.
 * Syntax errors become diagnostics (`SYNTAX_ERROR`); semantic errors never throw.
 */
import { URI } from "langium";

import { checkProgram, type Diagnostic } from "../check";
import type { Program } from "../ir";
import { isModel, type Model } from "../lang/generated/ast";
import { createNaviQlServices } from "../lang/naviql-module";
import { lowerProgram } from "./lower";

const EMPTY_PROGRAM: Program = {
  scalars: [],
  resources: [],
  queries: [],
  span: null,
};

const DEFAULT_URI = "inmemory:///naviql.naviql";

export type ParseAndCheckResult = {
  program: Program;
  diagnostics: Diagnostic[];
};

/**
 * Parse `.naviql` source, lower to IR, and run `checkProgram`.
 *
 * @param source - NaviQL source text
 * @param uri - optional document URI (attached to CST spans via Langium)
 */
export function parseAndCheck(source: string, uri?: string): ParseAndCheckResult {
  const { shared } = createNaviQlServices();
  const documentUri = URI.parse(uri ?? DEFAULT_URI);
  const document = shared.workspace.LangiumDocumentFactory.fromString<Model>(source, documentUri);
  const { value, lexerErrors, parserErrors } = document.parseResult;

  const diagnostics: Diagnostic[] = [];

  for (const err of lexerErrors) {
    diagnostics.push({
      code: "SYNTAX_ERROR",
      message: err.message,
      path: `offset:${err.offset}`,
    });
  }

  for (const err of parserErrors) {
    const offset = err.token?.startOffset;
    diagnostics.push({
      code: "SYNTAX_ERROR",
      message: err.message,
      path: typeof offset === "number" && offset >= 0 ? `offset:${offset}` : undefined,
    });
  }

  if (!isModel(value)) {
    if (diagnostics.length === 0) {
      diagnostics.push({
        code: "SYNTAX_ERROR",
        message: "Expected a NaviQL model",
      });
    }
    return { program: EMPTY_PROGRAM, diagnostics };
  }

  // Incomplete trees from recovery are unsafe to lower; surface syntax only.
  if (diagnostics.length > 0) {
    return { program: EMPTY_PROGRAM, diagnostics };
  }

  const program = lowerProgram(value);
  diagnostics.push(...checkProgram(program));
  return { program, diagnostics };
}
