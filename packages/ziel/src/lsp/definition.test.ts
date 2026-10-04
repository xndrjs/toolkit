import { EmptyFileSystem, URI } from "langium";
import { describe, expect, it } from "vitest";

import { analyzeProgram } from "../check";
import { createDiagnosticSink } from "../check/diagnostic";
import { lowerProgram } from "../compile/lower";
import type { SourceSpan } from "../ir";
import { isModel, type Model } from "../lang/generated/ast";
import { createZielServices } from "../lang/ziel-module";
import { createZielLspServices } from "./create-services";
import { definitionSpanAtOffset } from "./definition";

const FIXTURE = `
scalar EntryId on string;
scalar Locale on string;

resource Entry(id: EntryId, locale: Locale): {
  id
  title: string
  authorId: EntryId
}

query EntryDetail(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
  on Entry e {
    id
    title
    expand author: Entry(id: e.authorId, locale: locale)
  }
}
`;

function parseDocument(source: string, uri = "inmemory:///definition.ziel") {
  const { shared } = createZielServices(EmptyFileSystem);
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
  const { scalars, opaques, resources } = analyzeProgram(program);
  return { document, program, scalars, opaques, resources };
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

function expectSpanCovers(span: SourceSpan | undefined, source: string, needle: string): void {
  expect(span).toBeDefined();
  expect(source.slice(span!.start, span!.end)).toContain(needle);
}

describe("definitionSpanAtOffset", () => {
  it("jumps from scalar type refs to the scalar declaration", () => {
    const { document, program, scalars, opaques, resources } = tablesFrom(FIXTURE);
    // NamedTypeExpr in identity: `id: EntryId`
    const offset = offsetOf(FIXTURE, "EntryId", 1);
    const span = definitionSpanAtOffset(document, offset, { program, scalars, opaques, resources });
    expectSpanCovers(span, FIXTURE, "scalar EntryId");
    expect(span).toEqual(scalars.get("EntryId")!.span);
  });

  it("jumps from resource names to the resource declaration", () => {
    const { document, program, scalars, opaques, resources } = tablesFrom(FIXTURE);
    const onOffset = offsetOf(FIXTURE, "Entry", 2); // `on Entry e`
    expect(
      definitionSpanAtOffset(document, onOffset, { program, scalars, opaques, resources })
    ).toEqual(program.resources.find((r) => r.name === "Entry")!.span);

    const ctorOffset = offsetOf(FIXTURE, "Entry", 3); // `expand author: Entry(`
    expect(
      definitionSpanAtOffset(document, ctorOffset, { program, scalars, opaques, resources })
    ).toEqual(program.resources.find((r) => r.name === "Entry")!.span);
  });

  it("jumps from selected fields to payload / identity field decls", () => {
    const { document, program, scalars, opaques, resources } = tablesFrom(FIXTURE);
    const titleSelect = offsetOf(FIXTURE, "title", 1);
    expect(
      definitionSpanAtOffset(document, titleSelect, { program, scalars, opaques, resources })
    ).toEqual(resources.get("Entry")!.payload.get("title")!.span);

    // whole-word `id`: identity, payload shorthand, root NamedArg, then projection select
    const idSelect = offsetOf(FIXTURE, "id", 3);
    expect(
      definitionSpanAtOffset(document, idSelect, { program, scalars, opaques, resources })
    ).toEqual(resources.get("Entry")!.payload.get("id")!.span);
  });

  it("jumps from construction arg names to identity fields", () => {
    const { document, program, scalars, opaques, resources } = tablesFrom(FIXTURE);
    // `root Entry(id: entryId` — NamedArg name
    const idArg = offsetOf(FIXTURE, "id", 2);
    expect(
      definitionSpanAtOffset(document, idArg, { program, scalars, opaques, resources })
    ).toEqual(resources.get("Entry")!.identity.get("id")!.span);
  });

  it("jumps from field decl sites to themselves", () => {
    const { document, program, scalars, opaques, resources } = tablesFrom(FIXTURE);
    const titleDecl = offsetOf(FIXTURE, "title", 0);
    expect(
      definitionSpanAtOffset(document, titleDecl, { program, scalars, opaques, resources })
    ).toEqual(resources.get("Entry")!.payload.get("title")!.span);
  });

  it("registers ZielDefinitionProvider on LSP services", async () => {
    const { Ziel, semanticSnapshot } = createZielLspServices(EmptyFileSystem);
    expect(Ziel.lsp.DefinitionProvider).toBeDefined();
    const { document, program, scalars, opaques, resources } = tablesFrom(FIXTURE);
    semanticSnapshot.set({
      program,
      scalars,
      opaques,
      resources,
      documentsByUri: new Map([[document.uri.toString(), document]]),
    });

    const offset = offsetOf(FIXTURE, "EntryId", 1);
    const pos = document.textDocument.positionAt(offset);
    const links = await Ziel.lsp.DefinitionProvider!.getDefinition(document, {
      textDocument: { uri: document.uri.toString() },
      position: pos,
    });

    expect(links).toHaveLength(1);
    const link = links![0]!;
    expect(link.targetUri).toBe(document.uri.toString());
    const start = document.textDocument.offsetAt(link.targetRange.start);
    const end = document.textDocument.offsetAt(link.targetRange.end);
    expect(FIXTURE.slice(start, end)).toContain("scalar EntryId");
  });
});

const REFERS_FIXTURE = `
scalar EntryId on string;

resource Entry(id: EntryId): {
  id
  relatedId: EntryId refers Entry with { id: "x" }
}
`;

describe("definition refers targets", () => {
  it("jumps from refers resource name to the resource declaration", () => {
    const { document, program, scalars, opaques, resources } = tablesFrom(REFERS_FIXTURE);
    const refersEntry = offsetOf(REFERS_FIXTURE, "Entry", 1); // `refers Entry with`
    expect(
      definitionSpanAtOffset(document, refersEntry, { program, scalars, opaques, resources })
    ).toEqual(program.resources.find((r) => r.name === "Entry")!.span);
  });
});

const ISLANDS_FIXTURE = `
scalar EntryId on string;
scalar Locale on string;

resource Entry(id: EntryId, locale: Locale): {
  type: string
  id
}

resource Page(id: EntryId, locale: Locale): {
  id
}

query PageDetail(pageId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Page(id: pageId, locale: locale)
  on Page p {
    id
  }
  islands {
    on Entry e when e.type == "Menu"
  }
}
`;

describe("definition islands targets", () => {
  it("jumps from islands on-resource to the resource declaration", () => {
    const { document, program, scalars, opaques, resources } = tablesFrom(ISLANDS_FIXTURE);
    const islandsEntry = offsetOf(ISLANDS_FIXTURE, "Entry", 1); // islands on Entry
    expect(
      definitionSpanAtOffset(document, islandsEntry, { program, scalars, opaques, resources })
    ).toEqual(program.resources.find((r) => r.name === "Entry")!.span);
  });
});

const OPAQUE_DEF_FIXTURE = `
opaque RichDocument;
scalar EntryId on string;

resource Entry(id: EntryId): {
  id
  body: RichDocument
}
`;

describe("definition opaque targets", () => {
  it("jumps from opaque type refs to the opaque declaration", () => {
    const { document, program, scalars, opaques, resources } = tablesFrom(OPAQUE_DEF_FIXTURE);
    const ref = offsetOf(OPAQUE_DEF_FIXTURE, "RichDocument", 1);
    expect(definitionSpanAtOffset(document, ref, { program, scalars, opaques, resources })).toEqual(
      opaques.get("RichDocument")!.span
    );
  });

  it("jumps to opaque declarations across files via merged tables", () => {
    const opaqueSource = `opaque RichDocument;\n`;
    const resourceSource = `
scalar EntryId on string;
resource Entry(id: EntryId): {
  id
  body: RichDocument
}
`;
    const opaqueDoc = parseDocument(opaqueSource, "inmemory:///opaques.ziel");
    const resourceDoc = parseDocument(resourceSource, "inmemory:///resources.ziel");
    const sink = createDiagnosticSink();
    const opaqueProgram = lowerProgram(opaqueDoc.parseResult.value as Model, sink);
    const resourceProgram = lowerProgram(resourceDoc.parseResult.value as Model, sink);
    expect(sink.diagnostics.filter((d) => d.code.startsWith("LOWER"))).toEqual([]);

    const program = {
      scalars: resourceProgram.scalars,
      opaques: opaqueProgram.opaques,
      resources: resourceProgram.resources,
      fragments: [],
      datasources: [],
      queries: [],
      span: null,
    };
    const { scalars, opaques, resources } = analyzeProgram(program);

    const ref = offsetOf(resourceSource, "RichDocument", 0);
    const span = definitionSpanAtOffset(resourceDoc, ref, {
      program,
      scalars,
      opaques,
      resources,
    });
    expect(span).toEqual(opaques.get("RichDocument")!.span);
    expect(span?.uri).toBe(opaqueDoc.uri.toString());
  });
});
