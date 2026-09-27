import { EmptyFileSystem, URI } from "langium";
import { CompletionItemKind } from "vscode-languageserver";
import { describe, expect, it } from "vitest";

import { analyzeProgram } from "../check";
import { createDiagnosticSink } from "../check/diagnostic";
import { lowerProgram } from "../compile/lower";
import { isModel, type Model } from "../lang/generated/ast";
import { createZielServices } from "../lang/ziel-module";
import { classifyCompletionContext, completionsAtOffset } from "./completion";
import { createZielLspServices } from "./create-services";

const FIXTURE = `
scalar EntryId on string;
scalar Locale on string;

resource Entry(id: EntryId, locale: Locale): {
  type: "Hero"
  id
  title: string
  authorId: EntryId
} | {
  type: "Page"
  id
  title: string
  authorId: EntryId
} | {
  type: "Menu"
  id
  logoId: EntryId
}

query EntryDetail(entryId: EntryId) {
  context { locale: Locale }
  root Entry(id: entryId, locale: context.locale)
  on Entry e {
    id
    when e.type == "Hero" {
      title
    }
    when e.type == "Menu" {
      logoId
    }
  }
}
`;

function parseDocument(source: string, uri = "inmemory:///completion.ziel") {
  const { shared } = createZielServices(EmptyFileSystem);
  const document = shared.workspace.LangiumDocumentFactory.fromString<Model>(
    source,
    URI.parse(uri)
  );
  return document;
}

function tablesFrom(source: string) {
  const document = parseDocument(source);
  expect(document.parseResult.lexerErrors).toEqual([]);
  expect(document.parseResult.parserErrors).toEqual([]);
  expect(isModel(document.parseResult.value)).toBe(true);
  const model = document.parseResult.value as Model;
  const sink = createDiagnosticSink();
  const program = lowerProgram(model, sink);
  expect(sink.diagnostics.filter((d) => d.code.startsWith("LOWER"))).toEqual([]);
  const { scalars, resources } = analyzeProgram(program);
  return { document, scalars, resources };
}

/** Offset immediately after `needle` (occurrence-th match). */
function offsetAfter(source: string, needle: string, occurrence = 0): number {
  let from = 0;
  for (let i = 0; i <= occurrence; i++) {
    const idx = source.indexOf(needle, from);
    if (idx < 0) throw new Error(`needle ${JSON.stringify(needle)} occurrence ${i} not found`);
    if (i === occurrence) return idx + needle.length;
    from = idx + needle.length;
  }
  throw new Error("unreachable");
}

/** Offset of the start of the `occurrence`-th whole-word match. */
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

function labelsAt(
  source: string,
  offset: number,
  tables?: ReturnType<typeof tablesFrom>
): string[] {
  const ctx = tables ?? tablesFrom(source);
  return completionsAtOffset(ctx.document, offset, {
    scalars: ctx.scalars,
    resources: ctx.resources,
  }).map((i) => i.label);
}

describe("completionsAtOffset", () => {
  it("suggests scalars and resources in type positions", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    // NamedTypeExpr `EntryId` in identity
    const offset = offsetOf(FIXTURE, "EntryId", 1);
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("EntryId");
    expect(labels).toContain("Locale");
    expect(labels).toContain("Entry");
    expect(
      completionsAtOffset(document, offset, { scalars, resources }).find(
        (i) => i.label === "EntryId"
      )?.kind
    ).toBe(CompletionItemKind.TypeParameter);
  });

  it("suggests resources after on", () => {
    const incomplete = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
resource Page(id: EntryId, locale: Locale): { id }
query Q(entryId: EntryId) {
  context { locale: Locale }
  root Entry(id: entryId, locale: context.locale)
  on 
}
`;
    // Allow parse errors — cursor after `on `
    const document = parseDocument(incomplete);
    const sink = createDiagnosticSink();
    // Build tables from a complete sibling program
    const { scalars, resources } = tablesFrom(FIXTURE);
    void sink;
    const offset = offsetAfter(incomplete, "on ");
    expect(classifyCompletionContext(document, offset)).toEqual({ kind: "resources" });
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("Entry");
  });

  it("suggests resources for construction and refers targets", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): {
  id
  authorId: EntryId refers Entry with { type: "Hero" }
}
query Q(entryId: EntryId) {
  context { locale: Locale }
  root Entry(id: entryId, locale: context.locale)
  on Entry e {
    expand author: Entry(id: e.authorId, locale: context.locale)
  }
}
`;
    const { document, scalars, resources } = tablesFrom(source);
    const ctor = offsetOf(source, "Entry", 3); // expand author: Entry
    expect(
      completionsAtOffset(document, ctor, { scalars, resources }).map((i) => i.label)
    ).toContain("Entry");

    const refers = offsetOf(source, "Entry", 1); // refers Entry
    expect(
      completionsAtOffset(document, refers, { scalars, resources }).map((i) => i.label)
    ).toContain("Entry");
  });

  it("suggests payload fields in projection body", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    // selected field `id` in flat preamble (`on Entry e { id }`)
    const idSelect = offsetOf(FIXTURE, "id", 5);
    const labels = completionsAtOffset(document, idSelect, { scalars, resources }).map(
      (i) => i.label
    );
    // Intersection of Hero|Page|Menu union includes type + id
    expect(labels).toContain("id");
    expect(labels).toContain("type");
    expect(labels).not.toContain("title"); // not on all union members
    expect(labels).not.toContain("logoId");
  });

  it("narrows payload fields inside when arms", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    const titleInHero = offsetOf(FIXTURE, "title", 2); // when Hero { title }
    const heroLabels = completionsAtOffset(document, titleInHero, {
      scalars,
      resources,
    }).map((i) => i.label);
    expect(heroLabels).toContain("title");
    expect(heroLabels).toContain("authorId");
    expect(heroLabels).not.toContain("logoId");

    const logoInMenu = offsetOf(FIXTURE, "logoId", 1); // when Menu { logoId }
    const menuLabels = completionsAtOffset(document, logoInMenu, {
      scalars,
      resources,
    }).map((i) => i.label);
    expect(menuLabels).toContain("logoId");
    expect(menuLabels).not.toContain("title");
  });

  it("suggests identity arg names in constructions", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    // NamedArg `id` in root Entry(id: …
    const argName = offsetOf(FIXTURE, "id", 4);
    const labels = completionsAtOffset(document, argName, { scalars, resources }).map(
      (i) => i.label
    );
    // Current arg `id` stays offered; sibling `locale` is already used elsewhere.
    expect(labels).toContain("id");
    expect(labels).not.toContain("locale");
    expect(
      completionsAtOffset(document, argName, { scalars, resources }).find((i) => i.label === "id")
        ?.kind
    ).toBe(CompletionItemKind.Property);

    // Empty arg list: both identity fields
    const emptyArgs = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
query Q(entryId: EntryId) {
  context { locale: Locale }
  root Entry(
    
  )
}
`;
    const emptyDoc = parseDocument(emptyArgs);
    const offset = offsetAfter(emptyArgs, "root Entry(\n    ");
    // Tables from complete fixture (same Entry identity)
    expect(
      completionsAtOffset(emptyDoc, offset, { scalars, resources })
        .map((i) => i.label)
        .sort()
    ).toEqual(["id", "locale"]);
  });

  it("filters by partial prefix", () => {
    const incomplete = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
query Q(entryId: EntryId) {
  context { locale: Locale }
  root Entry(id: entryId, locale: context.locale)
  on En
}
`;
    const document = parseDocument(incomplete);
    const { scalars, resources } = tablesFrom(FIXTURE);
    const offset = offsetAfter(incomplete, "on En");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("Entry");
    expect(labels.every((l) => l.toLowerCase().startsWith("en"))).toBe(true);
  });

  it("registers ZielCompletionProvider on LSP services", async () => {
    const { Ziel, semanticSnapshot } = createZielLspServices(EmptyFileSystem);
    expect(Ziel.lsp.CompletionProvider).toBeDefined();
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    semanticSnapshot.set({
      program: { scalars: [], resources: [], queries: [], span: null },
      scalars,
      resources,
      documentsByUri: new Map([[document.uri.toString(), document]]),
    });

    const offset = offsetOf(FIXTURE, "EntryId", 1);
    const pos = document.textDocument.positionAt(offset);
    const list = await Ziel.lsp.CompletionProvider!.getCompletion(document, {
      textDocument: { uri: document.uri.toString() },
      position: pos,
    });
    const labels = list?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("EntryId");
    expect(labels).toContain("Entry");
  });
});

describe("selectableFieldNames via when narrowing", () => {
  it("uses tablesFrom fixture offsets without throwing", () => {
    // Smoke: incomplete cursor after `{` in projection
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id title: string }
query Q(entryId: EntryId) {
  context { locale: Locale }
  root Entry(id: entryId, locale: context.locale)
  on Entry e {
    
  }
}
`;
    const { document, scalars, resources } = tablesFrom(source);
    const offset = offsetAfter(source, "on Entry e {\n    ");
    expect(labelsAt(source, offset, { document, scalars, resources })).toEqual(
      expect.arrayContaining(["id", "title"])
    );
  });
});

const PATH_FIXTURE = `
scalar EntryId on string;
scalar Locale on string;

resource Entry(id: EntryId, locale: Locale): {
  type: "Hero"
  id
  title: string
  authorId: EntryId
  meta: { something: string }
  strips: { id: EntryId }[]
} | {
  type: "Page"
  id
  title: string
  authorId: EntryId
  meta: { something: string }
  strips: { id: EntryId }[]
}

query PageDetail(pageId: EntryId) {
  context {
    locale: Locale
    meta: { something: string }
  }
  root Entry(id: pageId, locale: context.locale)
  on Entry p {
    expand author: Entry(id: p.authorId, locale: @p.locale)
    expand strips: each link in p.strips (
      Entry(id: link.id, locale: context.locale)
    )
    when p.type == "Hero" {
      title
      expand x: Entry(id: p.authorId, locale: @p.locale)
    }
  }
}
`;

describe("path property completions", () => {
  it("completes payload fields after p.", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);
    const offset = offsetAfter(PATH_FIXTURE, "id: p.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("authorId");
    expect(labels).toContain("title");
    expect(labels).toContain("strips");
    expect(labels).toContain("meta");
  });

  it("completes identity fields after @p.", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);
    const offset = offsetAfter(PATH_FIXTURE, "locale: @p.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toEqual(expect.arrayContaining(["id", "locale"]));
    expect(labels).not.toContain("authorId");
    expect(labels).not.toContain("title");
  });

  it("completes context fields after context.", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);
    const offset = offsetAfter(PATH_FIXTURE, "locale: context.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toEqual(expect.arrayContaining(["locale", "meta"]));
  });

  it("completes nested context.meta.", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
query Q(pageId: EntryId) {
  context {
    locale: Locale
    meta: { something: string }
  }
  root Entry(id: pageId, locale: context.meta.)
  on Entry p { id }
}
`;
    // Incomplete trailing dot — may have parse errors
    const document = parseDocument(source);
    const { scalars, resources } = tablesFrom(PATH_FIXTURE);
    const offset = offsetAfter(source, "context.meta.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("something");
  });

  it("completes each item fields after link.", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);
    const offset = offsetAfter(PATH_FIXTURE, "id: link.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("id");
  });

  it("completes payload fields in when clause after p.", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);
    const offset = offsetAfter(PATH_FIXTURE, "when p.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("type");
    expect(labels).toContain("title");
  });

  it("narrows payload fields inside when arm for p.", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);
    // p.authorId inside when Hero arm
    const offset = offsetAfter(PATH_FIXTURE, "expand x: Entry(id: p.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("authorId");
    expect(labels).toContain("title");
  });

  it("filters path completions by partial segment", () => {
    const { scalars, resources } = tablesFrom(PATH_FIXTURE);
    const synthetic = PATH_FIXTURE.replace("id: p.authorId", "id: p.auth");
    const doc = parseDocument(synthetic);
    const off = offsetAfter(synthetic, "id: p.auth");
    const labels = completionsAtOffset(doc, off, { scalars, resources }).map((i) => i.label);
    expect(labels).toContain("authorId");
    expect(labels.every((l) => l.toLowerCase().startsWith("auth"))).toBe(true);
  });
});

const ISLANDS_FIXTURE = `
scalar EntryId on string;
scalar Locale on string;

resource Entry(id: EntryId, locale: Locale): {
  type: string
  id
  title: string
}

resource Page(id: EntryId, locale: Locale): {
  id
}

query PageDetail(pageId: EntryId) {
  context { locale: Locale }
  root Page(id: pageId, locale: context.locale)
  on Page p {
    id
  }
  islands {
    on Entry e when e.type == "Menu"
  }
}
`;

describe("islands completions", () => {
  it("suggests resources for islands on clause", () => {
    const { document, scalars, resources } = tablesFrom(ISLANDS_FIXTURE);
    const onEntry = offsetOf(ISLANDS_FIXTURE, "Entry", 1); // islands on Entry
    expect(
      completionsAtOffset(document, onEntry, { scalars, resources }).map((i) => i.label)
    ).toContain("Entry");
  });

  it("suggests payload fields on island binding paths", () => {
    const { document, scalars, resources } = tablesFrom(ISLANDS_FIXTURE);
    const offset = offsetAfter(ISLANDS_FIXTURE, "when e.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("type");
    expect(labels).toContain("title");
  });
});
