import { EmptyFileSystem, URI } from "langium";
import { describe, expect, it } from "vitest";

import { analyzeProgram } from "../check";
import { lowerProgram } from "../compile/lower";
import { createDiagnosticSink } from "../check/diagnostic";
import { isModel, type Model } from "../lang/generated/ast";
import { createZielServices } from "../lang/ziel-module";
import { createZielLspServices } from "./create-services";
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

function parseDocument(source: string, uri = "inmemory:///hover.ziel") {
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
    expect(md).toContain("resource Entry(\n  id: EntryId,\n  locale: Locale\n)");
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

  it("registers ZielHoverProvider on LSP services", async () => {
    const { Ziel, semanticSnapshot } = createZielLspServices(EmptyFileSystem);
    expect(Ziel.lsp.HoverProvider).toBeDefined();
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    semanticSnapshot.set({
      program: {
        scalars: [],
        resources: [],
        fragments: [],
        datasources: [],
        queries: [],
        span: null,
      },
      scalars,
      resources,
      documentsByUri: new Map([[document.uri.toString(), document]]),
    });

    const offset = offsetOf(FIXTURE, "EntryId", 1);
    const pos = document.textDocument.positionAt(offset);
    const hover = await Ziel.lsp.HoverProvider!.getHoverContent(document, {
      textDocument: { uri: document.uri.toString() },
      position: pos,
    });
    expect(hover?.contents).toMatchObject({
      kind: "markdown",
      value: expect.stringContaining("scalar EntryId on string"),
    });
  });
});

const PATH_FIXTURE = `
scalar EntryId on string;
scalar Locale on string;

resource Entry(id: EntryId, locale: Locale): {
  id
  footerId: EntryId
  strips: { id: EntryId }[]
  meta: { something: string }
}

query PageDetail(pageId: EntryId) {
  context {
    locale: Locale
    meta: { something: string }
  }
  root Entry(id: pageId, locale: context.locale)
  on Entry p {
    expand footer: Entry(id: p.footerId, locale: @p.locale)
    expand strips: each link in p.strips (
      Entry(id: link.id, locale: context.meta.something)
    )
  }
}
`;

describe("hover expression paths", () => {
  it("hovers payload paths like p.footerId", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);
    const footerId = offsetOf(PATH_FIXTURE, "footerId", 1); // use in p.footerId
    expect(hoverMarkdownAtOffset(document, footerId, { scalars, resources })).toContain(
      "footerId: EntryId"
    );

    const binding = offsetOf(PATH_FIXTURE, "p", 1); // p.footerId head (after on Entry p)
    expect(hoverMarkdownAtOffset(document, binding, { scalars, resources })).toContain(
      "resource Entry("
    );
  });

  it("hovers identity paths like @p.locale", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);
    const locale = offsetOf(PATH_FIXTURE, "locale", 5); // @p.locale
    expect(hoverMarkdownAtOffset(document, locale, { scalars, resources })).toContain(
      "locale: Locale"
    );

    const binding = offsetOf(PATH_FIXTURE, "p", 2); // @p in @p.locale
    expect(hoverMarkdownAtOffset(document, binding, { scalars, resources })).toContain(
      "p: {\n  id: EntryId\n  locale: Locale\n}"
    );
  });

  it("hovers context keyword and nested context paths", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);

    const contextKw = offsetOf(PATH_FIXTURE, "context", 1); // context.locale in root
    expect(hoverMarkdownAtOffset(document, contextKw, { scalars, resources })).toContain(
      "context: {"
    );
    expect(hoverMarkdownAtOffset(document, contextKw, { scalars, resources })).toContain(
      "locale: Locale"
    );

    const locale = offsetOf(PATH_FIXTURE, "locale", 3); // context.locale
    expect(hoverMarkdownAtOffset(document, locale, { scalars, resources })).toContain(
      "locale: Locale"
    );

    const meta = offsetOf(PATH_FIXTURE, "meta", 2); // context.meta.something
    expect(hoverMarkdownAtOffset(document, meta, { scalars, resources })).toContain(
      "meta: {\n  something: string\n}"
    );

    const something = offsetOf(PATH_FIXTURE, "something", 2);
    expect(hoverMarkdownAtOffset(document, something, { scalars, resources })).toContain(
      "something: string"
    );
  });

  it("hovers context fields inside datasource when clauses", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
scalar SpaceId on string;

resource Entry(id: EntryId, locale: Locale): { id }

datasource CmsEntries {
  context {
    spaceId: SpaceId
    locale: Locale
  }
  for Entry e when context.locale == @e.locale
}
`;
    const { document, scalars, resources } = tablesFrom(source);
    const contextKw = offsetOf(source, "context", 1); // context.locale in when
    expect(hoverMarkdownAtOffset(document, contextKw, { scalars, resources })).toContain(
      "context: {"
    );
    expect(hoverMarkdownAtOffset(document, contextKw, { scalars, resources })).toContain(
      "locale: Locale"
    );

    const locale = offsetOf(source, "locale", 3); // context.locale
    expect(hoverMarkdownAtOffset(document, locale, { scalars, resources })).toContain(
      "locale: Locale"
    );
  });

  it("hovers item paths inside each", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);
    const linkId = offsetOf(PATH_FIXTURE, "id", 6); // link.id
    expect(hoverMarkdownAtOffset(document, linkId, { scalars, resources })).toContain(
      "id: EntryId"
    );

    const link = offsetOf(PATH_FIXTURE, "link", 1); // link.id head
    expect(hoverMarkdownAtOffset(document, link, { scalars, resources })).toContain(
      "link: {\n  id: EntryId\n}"
    );
  });

  it("hovers each item binding (each ref in …)", () => {
    const { document, scalars, resources } = tablesFrom(PATH_FIXTURE);
    const itemBinding = offsetOf(PATH_FIXTURE, "link", 0); // each link in
    expect(hoverMarkdownAtOffset(document, itemBinding, { scalars, resources })).toContain(
      "link: {\n  id: EntryId\n}"
    );
  });

  it("hovers nested payload paths like p.meta.something", () => {
    // Type mismatch on id arg is fine — hover only needs tables + AST.
    const loose = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): {
  id
  meta: { something: string }
}
query Q(pageId: EntryId) {
  context { locale: Locale }
  root Entry(id: pageId, locale: context.locale)
  on Entry p {
    expand x: Entry(id: p.meta.something, locale: @p.locale)
  }
}
`;
    const { document, scalars, resources } = tablesFrom(loose);
    const meta = offsetOf(loose, "meta", 1); // p.meta.something
    expect(hoverMarkdownAtOffset(document, meta, { scalars, resources })).toContain(
      "meta: {\n  something: string\n}"
    );
    const something = offsetOf(loose, "something", 1);
    expect(hoverMarkdownAtOffset(document, something, { scalars, resources })).toContain(
      "something: string"
    );
  });
});

const FRAGMENT_FIXTURE = `
scalar EntryId on string;
scalar Locale on string;

resource Entry(id: EntryId, locale: Locale): {
  type: string
  id
  title: string
}

fragment EntryBase on Entry e {
  type
  id
}

fragment EntryTitle on Entry e {
  ...EntryBase
  title
}

query Q(entryId: EntryId) {
  context { locale: Locale }
  root Entry(id: entryId, locale: context.locale)
  on Entry e {
    ...EntryBase
  }
}
`;

describe("hover fragments", () => {
  it("hovers fragment declaration name as projected shape", () => {
    const { document, scalars, resources } = tablesFrom(FRAGMENT_FIXTURE);
    const name = offsetOf(FRAGMENT_FIXTURE, "EntryBase", 0); // fragment EntryBase
    expect(hoverMarkdownAtOffset(document, name, { scalars, resources })).toContain(
      "fragment EntryBase on Entry: {\n  type: string\n  id: EntryId\n}"
    );
  });

  it("hovers fragment spread ...EntryBase", () => {
    const { document, scalars, resources } = tablesFrom(FRAGMENT_FIXTURE);
    const spread = offsetOf(FRAGMENT_FIXTURE, "EntryBase", 2); // ...EntryBase in query
    expect(hoverMarkdownAtOffset(document, spread, { scalars, resources })).toContain(
      "{\n  type: string\n  id: EntryId\n}"
    );
  });

  it("hovers selected fields inside a fragment body", () => {
    const { document, scalars, resources } = tablesFrom(FRAGMENT_FIXTURE);
    // `type` in fragment EntryBase body (after payload `type: string`)
    const typeField = offsetOf(FRAGMENT_FIXTURE, "type", 1);
    expect(hoverMarkdownAtOffset(document, typeField, { scalars, resources })).toContain(
      "type: string"
    );

    const idField = offsetOf(FRAGMENT_FIXTURE, "id", 2); // fragment body id (after identity + payload shorthand)
    expect(hoverMarkdownAtOffset(document, idField, { scalars, resources })).toContain(
      "id: EntryId"
    );
  });

  it("hovers fragment that spreads another (flattened fields)", () => {
    const { document, scalars, resources } = tablesFrom(FRAGMENT_FIXTURE);
    const name = offsetOf(FRAGMENT_FIXTURE, "EntryTitle", 0);
    expect(hoverMarkdownAtOffset(document, name, { scalars, resources })).toContain(
      "fragment EntryTitle on Entry: {\n  type: string\n  id: EntryId\n  title: string\n}"
    );
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

describe("hover islands", () => {
  it("hovers islands on-resource and when paths", () => {
    const { document, scalars, resources } = tablesFrom(ISLANDS_FIXTURE);
    const onEntry = offsetOf(ISLANDS_FIXTURE, "Entry", 1); // islands on Entry
    expect(hoverMarkdownAtOffset(document, onEntry, { scalars, resources })).toContain(
      "resource Entry("
    );

    const typePath = offsetOf(ISLANDS_FIXTURE, "type", 1); // e.type in when
    expect(hoverMarkdownAtOffset(document, typePath, { scalars, resources })).toContain(
      "type: string"
    );

    const binding = offsetOf(ISLANDS_FIXTURE, "e", 1); // e.type head
    expect(hoverMarkdownAtOffset(document, binding, { scalars, resources })).toContain(
      "resource Entry("
    );
  });
});

const FRAGMENT_WHEN_HOVER_FIXTURE = `
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

fragment MenuOnly on Entry e when e.type == "Menu" {
  logoId
  expand related: Entry(id: e.logoId, locale: @e.locale)
}

query Q(entryId: EntryId) {
  context { locale: Locale }
  root Entry(id: entryId, locale: context.locale)
  on Entry e {
    ...MenuOnly
  }
}
`;

describe("hover fragment when narrowing", () => {
  it("hovers Menu-only payload paths inside fragment when body", () => {
    const { document, scalars, resources } = tablesFrom(FRAGMENT_WHEN_HOVER_FIXTURE);
    const logoPath = offsetOf(FRAGMENT_WHEN_HOVER_FIXTURE, "logoId", 2); // e.logoId
    expect(hoverMarkdownAtOffset(document, logoPath, { scalars, resources })).toContain(
      "logoId: EntryId"
    );
  });

  it("does not resolve Hero-only fields inside Menu fragment when body", () => {
    // Inject a Hero-only name into the expand path; narrowing should not type it.
    const source = FRAGMENT_WHEN_HOVER_FIXTURE.replace("id: e.logoId", "id: e.authorId");
    const { document, scalars, resources } = tablesFrom(source);
    const authorPath = offsetOf(source, "authorId", 2); // e.authorId (after Hero + Page decls)
    const md = hoverMarkdownAtOffset(document, authorPath, { scalars, resources });
    expect(md ?? "").not.toContain("authorId: EntryId");
  });
});
