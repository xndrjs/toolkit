import { EmptyFileSystem, URI } from "langium";
import { describe, expect, it } from "vitest";

import { analyzeProgram } from "../check";
import { lowerProgram } from "../compile/lower";
import { createDiagnosticSink } from "../check/diagnostic";
import { isModel, type Model } from "../lang/generated/ast";
import { createNaviQlServices } from "../lang/naviql-module";
import { createNaviQlLspServices } from "./create-services";
import { hoverMarkdownAtOffset } from "./hover";

const FIXTURE = `
scalar EntryId on string;
scalar Locale on string;

resource Entry(id: EntryId, locale: Locale): {
  id
  title: string
  authorId: EntryId
}

query EntryDetail(entryId: EntryId) {
  context { locale: Locale }
  root Entry(id: entryId, locale: context.locale)
  on Entry e {
    id
    title
    expand author: Entry(id: e.authorId, locale: context.locale)
  }
}
`;

function parseDocument(source: string, uri = "inmemory:///hover.naviql") {
  const { shared } = createNaviQlServices(EmptyFileSystem);
  const document = shared.workspace.LangiumDocumentFactory.fromString<Model>(
    source,
    URI.parse(uri)
  );
  expect(document.parseResult.lexerErrors).toEqual([]);
  expect(document.parseResult.parserErrors).toEqual([]);
  expect(isModel(document.parseResult.value)).toBe(true);
  return document;
}

function tablesFrom(source: string) {
  const document = parseDocument(source);
  const model = document.parseResult.value as Model;
  const sink = createDiagnosticSink();
  const program = lowerProgram(model, sink);
  expect(sink.diagnostics.filter((d) => d.code.startsWith("LOWER"))).toEqual([]);
  const { scalars, resources } = analyzeProgram(program);
  return { document, scalars, resources };
}

/** Offset of the `occurrence`-th whole-word match of `needle` (ID token). */
function offsetOf(source: string, needle: string, occurrence = 0): number {
  const re = new RegExp(`(?<![\\w_])${needle}(?![\\w_])`, "g");
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(source)) !== null) {
    if (i === occurrence) return match.index;
    i++;
  }
  throw new Error(`needle ${JSON.stringify(needle)} occurrence ${occurrence} not found`);
}

describe("hoverMarkdownAtOffset", () => {
  it("hovers scalar type names", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    // NamedTypeExpr in identity: `id: EntryId`
    const offset = offsetOf(FIXTURE, "EntryId", 1);
    const md = hoverMarkdownAtOffset(document, offset, { scalars, resources });
    expect(md).toContain("scalar EntryId on string");
  });

  it("hovers resource declaration name", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    const offset = offsetOf(FIXTURE, "Entry", 0); // `resource Entry`
    const md = hoverMarkdownAtOffset(document, offset, { scalars, resources });
    expect(md).toContain("resource Entry(id: EntryId, locale: Locale)");
    expect(md).toContain("title: string");
  });

  it("hovers on-resource and construction resource names", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    const onOffset = offsetOf(FIXTURE, "Entry", 2); // `on Entry e`
    expect(hoverMarkdownAtOffset(document, onOffset, { scalars, resources })).toContain(
      "resource Entry("
    );

    const ctorOffset = offsetOf(FIXTURE, "Entry", 3); // `expand author: Entry(`
    expect(hoverMarkdownAtOffset(document, ctorOffset, { scalars, resources })).toContain(
      "resource Entry("
    );
  });

  it("hovers identity and payload fields", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    // identity field name `id` in `Entry(id: EntryId`
    const idOffset = offsetOf(FIXTURE, "id", 0);
    expect(hoverMarkdownAtOffset(document, idOffset, { scalars, resources })).toContain(
      "id: EntryId"
    );

    const titleDeclOffset = offsetOf(FIXTURE, "title", 0); // payload `title: string`
    expect(hoverMarkdownAtOffset(document, titleDeclOffset, { scalars, resources })).toContain(
      "title: string"
    );
  });

  it("hovers selected fields in projection body", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    // projection body `title` (second whole-word title: payload decl, then select)
    const titleSelectOffset = offsetOf(FIXTURE, "title", 1);
    expect(hoverMarkdownAtOffset(document, titleSelectOffset, { scalars, resources })).toContain(
      "title: string"
    );

    // whole-word `id`: identity, payload shorthand, root NamedArg, then projection select
    const idSelectOffset = offsetOf(FIXTURE, "id", 3);
    expect(hoverMarkdownAtOffset(document, idSelectOffset, { scalars, resources })).toContain(
      "id: EntryId"
    );
  });

  it("registers NaviQlHoverProvider on LSP services", async () => {
    const { NaviQl, semanticSnapshot } = createNaviQlLspServices(EmptyFileSystem);
    expect(NaviQl.lsp.HoverProvider).toBeDefined();
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    semanticSnapshot.set({
      program: { scalars: [], resources: [], queries: [], span: null },
      scalars,
      resources,
      documentsByUri: new Map([[document.uri.toString(), document]]),
    });

    const offset = offsetOf(FIXTURE, "EntryId", 1);
    const pos = document.textDocument.positionAt(offset);
    const hover = await NaviQl.lsp.HoverProvider!.getHoverContent(document, {
      textDocument: { uri: document.uri.toString() },
      position: pos,
    });
    expect(hover?.contents).toMatchObject({
      kind: "markdown",
      value: expect.stringContaining("scalar EntryId on string"),
    });
  });
});
