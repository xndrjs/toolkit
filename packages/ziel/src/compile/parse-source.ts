import { URI } from "langium";

import type { Diagnostic } from "../check";
import type { SourceSpan } from "../ir";
import { isModel, type Model } from "../lang/generated/ast";
import { createZielServices } from "../lang/ziel-module";

const DEFAULT_URI = "inmemory:///ziel.ziel";

export type ParseSourceResult = {
  model: Model | null;
  diagnostics: Diagnostic[];
};

function syntaxSpan(uri: string, start: number, end: number): SourceSpan {
  return { start, end: Math.max(end, start), uri };
}

/** Create a parser that reuses one Langium service graph across source files. */
export function createSourceParser(): (source: string, uri?: string) => ParseSourceResult {
  const { shared } = createZielServices();

  return (source: string, uri?: string): ParseSourceResult => {
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
      return { model: null, diagnostics };
    }

    // Recovery trees are not safe inputs for lowering.
    return diagnostics.length > 0
      ? { model: null, diagnostics }
      : { model: value, diagnostics: [] };
  };
}

/** Parse one source without lowering or semantic checking. */
export function parseSource(source: string, uri?: string): ParseSourceResult {
  return createSourceParser()(source, uri);
}
