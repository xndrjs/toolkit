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

query EntryDetail(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
  on Entry e {
    id
    when e.type == "Hero" {
      title
    }
    when e.type == "Menu" {
      logoId
    }
    default { }
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
  const { scalars, opaques, resources } = analyzeProgram(program);
  return { document, scalars, opaques, resources, program };
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
  tables?: Partial<ReturnType<typeof tablesFrom>> &
    Pick<ReturnType<typeof tablesFrom>, "document" | "scalars" | "resources">
): string[] {
  const ctx = tables ?? tablesFrom(source);
  return completionsAtOffset(ctx.document, offset, {
    scalars: ctx.scalars,
    opaques: ctx.opaques,
    resources: ctx.resources,
    program: ctx.program,
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
query Q(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
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
query Q(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
  on Entry e {
    expand author: Entry(id: e.authorId, locale: locale)
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
query Q(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
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
query Q(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
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
      program: {
        scalars: [],
        opaques: [],
        resources: [],
        fragments: [],
        datasources: [],
        queries: [],
        span: null,
      },
      scalars,
      opaques: new Map(),
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
query Q(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
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

query PageDetail(pageId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: pageId, locale: locale)
  on Entry p {
    expand author: Entry(id: p.authorId, locale: @p.locale)
    expand strips: each link in p.strips (
      Entry(id: link.id, locale: locale)
    )
    when p.type == "Hero" {
      title
      expand x: Entry(id: p.authorId, locale: @p.locale)
    }
    default { }
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

  it("does not complete context fields after context. in query bodies", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
query Q(pageId: EntryId, locale: Locale) {
  context { locale }
  root Entry(id: pageId, locale: context.)
  on Entry p { id }
}
`;
    const document = parseDocument(source);
    const { scalars, resources } = tablesFrom(PATH_FIXTURE);
    const offset = offsetAfter(source, "context.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).not.toEqual(expect.arrayContaining(["locale"]));
  });

  it("completes nested payload meta.", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id meta: { something: string } }
query Q(pageId: EntryId, locale: Locale) {
  context { locale }
  root Entry(id: pageId, locale: locale)
  on Entry p {
    expand x: Entry(id: p.meta.something, locale: locale)
  }
}
`;
    const { document, scalars, resources } = tablesFrom(source);
    const offset = offsetAfter(source, "p.meta.");
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

const FRAGMENT_WHEN_FIXTURE = `
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

fragment Unnarrowed on Entry e {
  id
}

query Q(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
  on Entry e {
    ...MenuOnly
  }
}
`;

describe("fragment when narrowing completions", () => {
  it("narrows selected-field suggestions inside fragment when body", () => {
    const { document, scalars, resources } = tablesFrom(FRAGMENT_WHEN_FIXTURE);
    const logoField = offsetOf(FRAGMENT_WHEN_FIXTURE, "logoId", 1); // fragment body logoId
    const menuLabels = completionsAtOffset(document, logoField, { scalars, resources }).map(
      (i) => i.label
    );
    expect(menuLabels).toContain("logoId");
    expect(menuLabels).not.toContain("title");
    expect(menuLabels).not.toContain("authorId");
  });

  it("narrows binding path completions inside fragment when body", () => {
    const { document, scalars, resources } = tablesFrom(FRAGMENT_WHEN_FIXTURE);
    const offset = offsetAfter(FRAGMENT_WHEN_FIXTURE, "id: e.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("logoId");
    expect(labels).not.toContain("title");
    expect(labels).not.toContain("authorId");
  });

  it("keeps full payload suggestions inside fragment without when", () => {
    const { document, scalars, resources } = tablesFrom(FRAGMENT_WHEN_FIXTURE);
    const offset = offsetAfter(FRAGMENT_WHEN_FIXTURE, "fragment Unnarrowed on Entry e {\n  ");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    // Intersection of Hero|Page|Menu — shared fields only
    expect(labels).toContain("id");
    expect(labels).toContain("type");
    expect(labels).not.toContain("logoId");
    expect(labels).not.toContain("title");
  });
});

describe("progressive and-narrowing completions", () => {
  it("suggests Footer-only fields after kind == Footer and e.", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): {
  kind: "Hero"
  id
  title: string
} | {
  kind: "Footer"
  id
  title: string
  cta: string
}
query Q(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
  on Entry e {
    when e.kind == "Footer" and e.cta == "x" { }
    default { }
  }
}
`;
    const { document, scalars, resources } = tablesFrom(source);
    const offset = offsetAfter(source, 'when e.kind == "Footer" and e.');
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("cta");
    expect(labels).toContain("title");
    expect(labels).not.toContain("authorId");
  });
});

describe("string-literal comparison completions", () => {
  it('suggests discriminant values inside e.type == "', () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    const offset = offsetAfter(FIXTURE, 'when e.type == "');
    const items = completionsAtOffset(document, offset, { scalars, resources });
    const labels = items.map((i) => i.label);
    expect(labels).toEqual(["Hero", "Menu", "Page"]);
    expect(items.every((i) => i.kind === CompletionItemKind.EnumMember)).toBe(true);
  });

  it("filters by partial text inside the open string", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    const offset = offsetAfter(FIXTURE, 'when e.type == "He');
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toEqual(["Hero"]);
  });

  it("suggests values with an unclosed quote (incomplete parse)", () => {
    const incomplete = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): {
  type: "Hero"
  id
} | {
  type: "Menu"
  id
}
query Q(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
  on Entry e {
    when e.type == "
`;
    const document = parseDocument(incomplete);
    const { scalars, resources } = tablesFrom(FIXTURE);
    const offset = offsetAfter(incomplete, 'when e.type == "');
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toContain("Hero");
    expect(labels).toContain("Menu");
  });

  it('suggests values inside in ("…")', () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): {
  type: "Hero"
  id
} | {
  type: "Page"
  id
} | {
  type: "Menu"
  id
}
query Q(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
  on Entry e {
    when e.type in ("
    default { }
  }
}
`;
    const document = parseDocument(source);
    const { scalars, resources } = tablesFrom(FIXTURE);
    const offset = offsetAfter(source, 'when e.type in ("');
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toEqual(["Hero", "Menu", "Page"]);
  });

  it("suggests kind literals when the field is named kind", () => {
    const complete = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): {
  kind: "Hero"
  id
} | {
  kind: "Footer"
  id
}
query Q(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
  on Entry e {
    when e.kind == "Hero" { }
    default { }
  }
}
`;
    const { scalars, resources } = tablesFrom(complete);
    const incomplete = complete.replace('when e.kind == "Hero"', 'when e.kind == "');
    const document = parseDocument(incomplete);
    const offset = offsetAfter(incomplete, 'when e.kind == "');
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toEqual(["Footer", "Hero"]);
  });

  it("returns no proposals for non-literal field comparisons", () => {
    const { document, scalars, resources } = tablesFrom(FIXTURE);
    const offset = offsetAfter(FIXTURE, 'when e.type == "Hero" {\n      ');
    // Not inside a string compare — selected fields, not literals
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).not.toContain("Hero");
    expect(labels).toContain("title");
  });
});

const DATASOURCE_FIXTURE = `
scalar EntryId on string;
scalar Locale on string;
scalar SpaceId on string;

resource Entry(id: EntryId, locale: Locale): { id title: string }
resource Asset(id: EntryId, locale: Locale): { id url: string }

datasource CmsEntries {
  context {
    spaceId: SpaceId
    locale: Locale
  }
  for Entry e when context.locale == @e.locale
  for Asset
}
`;

describe("query context block completions", () => {
  const QUERY_CONTEXT_FIXTURE = `
scalar EntryId on string;
scalar Locale on string;

resource Entry(id: EntryId, locale: Locale): { id type: string }

datasource CmsEntries {
  context { locale: Locale }
  for Entry
}

query Q(id: EntryId, locale: Locale, extra: string) {
  context {
    
  }
  root Entry(id: id, locale: locale)
  on Entry e { id type }
}
`;

  it("classifies inside query context as query-context-projection", () => {
    const document = parseDocument(QUERY_CONTEXT_FIXTURE);
    const offset = offsetAfter(QUERY_CONTEXT_FIXTURE, "context {\n    ");
    const ctx = classifyCompletionContext(document, offset);
    expect(ctx?.kind).toBe("query-context-projection");
  });

  it("suggests required missing fields and unused params", () => {
    const { document, scalars, resources, program } = tablesFrom(QUERY_CONTEXT_FIXTURE);
    const offset = offsetAfter(QUERY_CONTEXT_FIXTURE, "context {\n    ");
    const items = completionsAtOffset(document, offset, { scalars, resources, program });
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i]));
    expect(byLabel.locale?.detail).toMatch(/required by/);
    expect(byLabel.locale?.kind).toBe(CompletionItemKind.Field);
    expect(byLabel.extra?.detail).toBe("query param");
    expect(byLabel.id?.detail).toBe("query param");
  });

  it("omits params already projected", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
datasource CmsEntries {
  context { locale: Locale }
  for Entry
}
query Q(id: EntryId, locale: Locale, extra: string) {
  context {
    locale
  }
  root Entry(id: id, locale: locale)
  on Entry e { id }
}
`;
    const { document, scalars, resources, program } = tablesFrom(source);
    const offset = offsetAfter(source, "locale\n  ");
    const labels = completionsAtOffset(document, offset, { scalars, resources, program }).map(
      (i) => i.label
    );
    expect(labels).not.toContain("locale");
    expect(labels).toEqual(expect.arrayContaining(["extra", "id"]));
  });

  it("suggests the current entry when replacing an existing projection name", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
datasource CmsEntries {
  context { locale: Locale }
  for Entry
}
query Q(id: EntryId, locale: Locale, extra: string) {
  context {
    locale
  }
  root Entry(id: id, locale: locale)
  on Entry e { id }
}
`;
    const { document, scalars, resources, program } = tablesFrom(source);
    // Mid-token on existing query-context `locale` — still propose it (required).
    const offset = offsetAfter(source, "context {\n    loc");
    expect(classifyCompletionContext(document, offset)?.kind).toBe("query-context-projection");
    const items = completionsAtOffset(document, offset, { scalars, resources, program });
    expect(items.map((i) => i.label)).toContain("locale");
    expect(items.find((i) => i.label === "locale")?.detail).toMatch(/required by/);
  });

  it("suggests unused params on alias RHS", () => {
    const incomplete = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
datasource CmsEntries {
  context { locale: Locale }
  for Entry
}
query Q(id: EntryId, lang: Locale, extra: string) {
  context {
    locale: 
  }
  root Entry(id: id, locale: lang)
  on Entry e { id }
}
`;
    const complete = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
datasource CmsEntries {
  context { locale: Locale }
  for Entry
}
query Q(id: EntryId, lang: Locale, extra: string) {
  context {
    locale: lang
  }
  root Entry(id: id, locale: lang)
  on Entry e { id }
}
`;
    const document = parseDocument(incomplete);
    const { scalars, resources, program } = tablesFrom(complete);
    const offset = offsetAfter(incomplete, "context {\n    locale: ");
    expect(classifyCompletionContext(document, offset)?.kind).toBe("query-context-alias-param");
    const labels = completionsAtOffset(document, offset, { scalars, resources, program }).map(
      (i) => i.label
    );
    expect(labels).toEqual(expect.arrayContaining(["lang", "extra", "id"]));
  });
});

describe("datasource when path completions", () => {
  it("completes datasource context fields after context.", () => {
    const { document, scalars, resources } = tablesFrom(DATASOURCE_FIXTURE);
    const offset = offsetAfter(DATASOURCE_FIXTURE, "when context.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toEqual(expect.arrayContaining(["spaceId", "locale"]));
    expect(labels).not.toContain("Entry");
  });

  it("completes route identity fields after @e.", () => {
    const { document, scalars, resources } = tablesFrom(DATASOURCE_FIXTURE);
    const offset = offsetAfter(DATASOURCE_FIXTURE, "== @e.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toEqual(expect.arrayContaining(["id", "locale"]));
    expect(labels).not.toContain("title");
  });

  it("completes @c. identity fields when the when-clause is still incomplete", () => {
    // Parser recovery often leaves the leaf outside DatasourceRoute here.
    const incomplete = `
scalar EntryId on string;
scalar Locale on string;
scalar Ref on string;

resource CustomReference(ref: Ref, locale: Locale): { id: EntryId }

datasource CmsCustomReferences {
  context { locale: Locale }
  for CustomReference c when context.locale == @c.
}
`;
    const complete = `
scalar EntryId on string;
scalar Locale on string;
scalar Ref on string;
resource CustomReference(ref: Ref, locale: Locale): { id: EntryId }
datasource CmsCustomReferences {
  context { locale: Locale }
  for CustomReference c when context.locale == @c.locale
}
`;
    const { shared } = createZielServices(EmptyFileSystem);
    const document = shared.workspace.LangiumDocumentFactory.fromString(
      incomplete,
      URI.parse("inmemory:///ds-incomplete.ziel")
    );
    const { scalars, resources } = tablesFrom(complete);

    const offset = offsetAfter(incomplete, "== @c.");
    const labels = completionsAtOffset(document, offset, { scalars, resources }).map(
      (i) => i.label
    );
    expect(labels).toEqual(expect.arrayContaining(["ref", "locale"]));
    expect(labels).not.toContain("id");
  });
});

const OPAQUE_FIXTURE = `
opaque RichDocument;
opaque MediaDescriptor;
scalar EntryId on string;

resource Entry(id: EntryId): {
  id
  body: RichDocument
  media?: MediaDescriptor | null
}

query EntryDetail(entryId: EntryId) {
  root Entry(id: entryId)
  on Entry e {
    id
    body
  }
}
`;

describe("completionsAtOffset — opaque types", () => {
  it("suggests opaques in payload type positions with opaque detail", () => {
    const { document, scalars, opaques, resources, program } = tablesFrom(OPAQUE_FIXTURE);
    const offset = offsetOf(OPAQUE_FIXTURE, "RichDocument", 1); // body: RichDocument
    const items = completionsAtOffset(document, offset, {
      scalars,
      opaques,
      resources,
      program,
    });
    const labels = items.map((i) => i.label);
    expect(labels).toContain("RichDocument");
    expect(labels).toContain("MediaDescriptor");
    expect(labels).toContain("EntryId");
    expect(items.find((i) => i.label === "RichDocument")?.detail).toBe("opaque RichDocument");
  });

  it("does not suggest opaques in identity type positions", () => {
    const { document, scalars, opaques, resources, program } = tablesFrom(OPAQUE_FIXTURE);
    const offset = offsetOf(OPAQUE_FIXTURE, "EntryId", 1); // id: EntryId in identity
    const labels = completionsAtOffset(document, offset, {
      scalars,
      opaques,
      resources,
      program,
    }).map((i) => i.label);
    expect(labels).toContain("EntryId");
    expect(labels).not.toContain("RichDocument");
    expect(labels).not.toContain("MediaDescriptor");
  });

  it("does not suggest opaques in query parameter type positions", () => {
    const source = `
opaque RichDocument;
scalar EntryId on string;
resource Entry(id: EntryId): { id body: RichDocument }
query Q(doc: RichDocument, id: EntryId) {
  root Entry(id: id)
  on Entry e { id }
}
`;
    // Program is invalid (opaque in query param) but still lowers for IntelliSense tables.
    const document = parseDocument(source);
    const model = document.parseResult.value as Model;
    const sink = createDiagnosticSink();
    const program = lowerProgram(model, sink);
    const { scalars, opaques, resources } = analyzeProgram(program);
    // decl, payload field, then query param
    const offset = offsetOf(source, "RichDocument", 2);
    const labels = completionsAtOffset(document, offset, {
      scalars,
      opaques,
      resources,
      program,
    }).map((i) => i.label);
    expect(labels).toContain("EntryId");
    expect(labels).not.toContain("RichDocument");
  });

  it("does not suggest opaques in datasource context type positions", () => {
    const source = `
opaque RichDocument;
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId): { id }
datasource Entries {
  context {
    locale: Locale
    payload: RichDocument
  }
  for Entry
}
`;
    const document = parseDocument(source);
    const model = document.parseResult.value as Model;
    const sink = createDiagnosticSink();
    const program = lowerProgram(model, sink);
    const { scalars, opaques, resources } = analyzeProgram(program);
    const offset = offsetOf(source, "RichDocument", 1); // datasource context field
    const labels = completionsAtOffset(document, offset, {
      scalars,
      opaques,
      resources,
      program,
    }).map((i) => i.label);
    expect(labels).toContain("Locale");
    expect(labels).not.toContain("RichDocument");
  });

  it("does not suggest opaques after on / refers (resource-only contexts)", () => {
    const incomplete = `
opaque RichDocument;
scalar EntryId on string;
resource Entry(id: EntryId): { id body: RichDocument }
query Q(id: EntryId) {
  root Entry(id: id)
  on 
}
`;
    const document = parseDocument(incomplete);
    const { scalars, opaques, resources, program } = tablesFrom(OPAQUE_FIXTURE);
    const offset = offsetAfter(incomplete, "on ");
    const labels = completionsAtOffset(document, offset, {
      scalars,
      opaques,
      resources,
      program,
    }).map((i) => i.label);
    expect(labels).toContain("Entry");
    expect(labels).not.toContain("RichDocument");
  });
});
