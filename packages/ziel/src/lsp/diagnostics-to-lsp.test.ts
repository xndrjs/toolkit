/**
 * Headless span → LSP range round-trip (no VS Code host).
 */
import { describe, expect, it } from "vitest";

import { parseAndCheck } from "../compile/parse-and-check";
import { diagnosticToLsp, diagnosticsToLsp } from "./diagnostics-to-lsp";

describe("diagnosticsToLsp", () => {
  it("maps SYNTAX_ERROR spans to a non-empty LSP range", () => {
    const source = "scalar X on";
    const uri = "file:///fixtures/bad.ziel";
    const { diagnostics } = parseAndCheck(source, uri);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.code === "SYNTAX_ERROR")).toBe(true);
    expect(diagnostics[0]?.span).toEqual(
      expect.objectContaining({
        uri,
        start: expect.any(Number),
        end: expect.any(Number),
      })
    );
    expect(diagnostics[0]!.span!.end).toBeGreaterThan(diagnostics[0]!.span!.start);

    const lsp = diagnosticsToLsp(diagnostics, uri, source);
    expect(lsp).toHaveLength(diagnostics.length);

    const first = lsp[0]!;
    expect(first.code).toBe("SYNTAX_ERROR");
    expect(first.source).toBe("ziel");
    expect(first.range.start.line).toBeGreaterThanOrEqual(0);
    expect(
      first.range.end.line > first.range.start.line ||
        first.range.end.character > first.range.start.character
    ).toBe(true);
  });

  it("maps semantic diagnostics with spans to non-empty ranges", () => {
    const source = `
scalar Id on string;
resource Thing(id: Id): { id }
query Q(id: Id) {
  root Missing(id: id)
}
`;
    const uri = "file:///fixtures/unknown.ziel";
    const { diagnostics } = parseAndCheck(source, uri);
    const unknown = diagnostics.find((d) => d.code === "UNKNOWN_RESOURCE");

    expect(unknown).toBeDefined();
    expect(unknown!.span).toEqual(
      expect.objectContaining({
        uri,
        start: expect.any(Number),
        end: expect.any(Number),
      })
    );
    expect(unknown!.span!.end).toBeGreaterThan(unknown!.span!.start);

    const [lsp] = diagnosticsToLsp([unknown!], uri, source);
    expect(lsp!.code).toBe("UNKNOWN_RESOURCE");
    expect(
      lsp!.range.end.line > lsp!.range.start.line ||
        lsp!.range.end.character > lsp!.range.start.character
    ).toBe(true);
  });

  it("falls back to [0,0] when span is missing", () => {
    const lsp = diagnosticToLsp({ code: "GENERIC", message: "no span" }, () => ({
      line: 0,
      character: 0,
    }));

    expect(lsp.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    });
    expect(lsp.code).toBe("GENERIC");
  });

  it("forwards diagnostic.data for MISSING_ON_PROJECTION", () => {
    const lsp = diagnosticToLsp(
      {
        code: "MISSING_ON_PROJECTION",
        message: "Query 'Q' expands 'Asset' but has no 'on Asset' projection",
        data: { missingResource: "Asset" },
      },
      () => ({ line: 0, character: 0 })
    );

    expect(lsp.data).toEqual({ missingResource: "Asset" });
  });
});
