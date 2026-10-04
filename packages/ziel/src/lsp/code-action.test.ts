import { EmptyFileSystem, URI } from "langium";
import { describe, expect, it } from "vitest";
import {
  CodeActionKind,
  DiagnosticSeverity,
  type CodeAction,
  type Diagnostic,
} from "vscode-languageserver";

import { analyzeProgram } from "../check";
import { createDiagnosticSink } from "../check/diagnostic";
import { lowerProgram } from "../compile/lower";
import {
  isModel,
  isQueryDeclaration,
  type Model,
  type QueryDeclaration,
} from "../lang/generated/ast";
import { createZielServices } from "../lang/ziel-module";
import {
  isMissingOnDiagnostic,
  missingOnEditsForQuery,
  missingOnInsertOffset,
  missingOnInsertText,
  missingOnStubLine,
  missingContextEditsForQuery,
  missingContextInsertOffset,
  missingContextInsertText,
  missingRootEditsForQuery,
  missingRootInsertOffset,
  emptyRootsInsertText,
  uniqueProjectionBinding,
  usedBindingsInQuery,
  ZielCodeActionProvider,
  addContextFieldEditsForQuery,
  removeContextFieldEditsForQuery,
} from "./code-action";
import { createZielLspServices } from "./create-services";
import { createSemanticSnapshotCache } from "./semantic-snapshot";

const FIXTURE = `
scalar EntryId on string;
scalar Locale on string;
scalar AssetId on string;

resource Entry(id: EntryId, locale: Locale): {
  id
  imageId: AssetId
}

resource Asset(id: AssetId, locale: Locale): {
  id
  url: string
}

query EntryDetail(entryId: EntryId, locale: Locale) {
  context {
    locale
  }
  root Entry(id: entryId, locale: locale)
  on Entry e {
    id
    expand image: Asset(id: e.imageId, locale: locale)
  }

  islands {
    on Entry e when e.type == "Menu"
  }
}
`;

function parseDocument(source: string, uri = "inmemory:///code-action.ziel") {
  const { shared } = createZielServices(EmptyFileSystem);
  const document = shared.workspace.LangiumDocumentFactory.fromString<Model>(
    source.trim() + "\n",
    URI.parse(uri)
  );
  expect(document.parseResult.lexerErrors).toEqual([]);
  expect(document.parseResult.parserErrors).toEqual([]);
  expect(isModel(document.parseResult.value)).toBe(true);
  return document;
}

function queryFrom(source: string): {
  document: ReturnType<typeof parseDocument>;
  query: QueryDeclaration;
} {
  const document = parseDocument(source);
  const model = document.parseResult.value as Model;
  const query = model.declarations.find(isQueryDeclaration);
  expect(query).toBeDefined();
  return { document, query: query! };
}

function snapshotFrom(source: string) {
  const document = parseDocument(source);
  const model = document.parseResult.value as Model;
  const sink = createDiagnosticSink();
  const program = lowerProgram(model, sink);
  expect(sink.diagnostics.filter((d) => d.code.startsWith("LOWER"))).toEqual([]);
  const { scalars, opaques, resources } = analyzeProgram(program);
  return {
    document,
    snapshot: {
      program,
      scalars,
      opaques,
      resources,
      documentsByUri: new Map([[document.uri.toString(), document]]),
    },
  };
}

function applyInsert(source: string, offset: number, newText: string): string {
  return source.slice(0, offset) + newText + source.slice(offset);
}

describe("uniqueProjectionBinding", () => {
  it("uses the first letter lowercased when free", () => {
    expect(uniqueProjectionBinding("Asset", new Set())).toBe("a");
    expect(uniqueProjectionBinding("Entry", new Set(["p"]))).toBe("e");
  });

  it("falls back to camelCase then numbered first letter", () => {
    expect(uniqueProjectionBinding("Asset", new Set(["a"]))).toBe("asset");
    expect(uniqueProjectionBinding("Asset", new Set(["a", "asset"]))).toBe("a2");
    expect(uniqueProjectionBinding("Asset", new Set(["a", "asset", "a2"]))).toBe("a3");
  });
});

describe("missingOnInsertText / stub line", () => {
  it("formats a demo-style stub line", () => {
    expect(missingOnStubLine("Asset", "a")).toBe("  on Asset a include properties { }");
  });

  it("joins multiple stubs with a blank line and trailing blank line", () => {
    expect(
      missingOnInsertText([
        { resource: "Entry", binding: "e" },
        { resource: "Asset", binding: "a" },
      ])
    ).toBe("  on Entry e include properties { }\n\n  on Asset a include properties { }\n\n");
  });
});

describe("missingOnInsertOffset / placement", () => {
  it("inserts before islands when present", () => {
    const source = FIXTURE.trim() + "\n";
    const { document, query } = queryFrom(source);
    const offset = missingOnInsertOffset(query, document.textDocument.getText());
    expect(offset).toBeDefined();

    const used = usedBindingsInQuery(query, undefined);
    const binding = uniqueProjectionBinding("Asset", used);
    const inserted = applyInsert(
      document.textDocument.getText(),
      offset!,
      missingOnInsertText([{ resource: "Asset", binding }])
    );

    expect(inserted).toContain("  on Asset a include properties { }\n\n  islands {");
    expect(inserted.indexOf("on Asset a")).toBeLessThan(inserted.indexOf("islands {"));
  });

  it("inserts before the query closing brace when islands are absent", () => {
    const source = `
scalar Locale on string;
resource Entry(id: string, locale: Locale): { id }
query Q(id: string, locale: Locale) {
  context {
    locale
  }
  root Entry(id: id, locale: locale)
  on Entry e { id }
}
`;
    const { document, query } = queryFrom(source);
    const text = document.textDocument.getText();
    const offset = missingOnInsertOffset(query, text);
    expect(offset).toBeDefined();
    expect(text[offset!]).toBe("}");

    const inserted = applyInsert(
      text,
      offset!,
      missingOnInsertText([{ resource: "Asset", binding: "a" }])
    );
    expect(inserted).toMatch(/on Asset a include properties \{ \}\n\n\}\s*$/);
  });
});

describe("missingOnEditsForQuery", () => {
  it("avoids bindings already used in the query IR", () => {
    const { document, snapshot } = snapshotFrom(FIXTURE);
    const query = (document.parseResult.value as Model).declarations.find(isQueryDeclaration)!;
    const built = missingOnEditsForQuery(document, query, ["Asset"], snapshot);
    expect(built).toBeDefined();
    expect(built!.clauses).toEqual([{ resource: "Asset", binding: "a" }]);
    expect(built!.edits[0]!.newText).toContain("on Asset a include properties { }");
  });

  it("allocates a2 when a and asset are taken", () => {
    const source = `
scalar Locale on string;
resource Entry(id: string, locale: Locale): { id }
resource Asset(id: string, locale: Locale): { id }
query Q(id: string, locale: Locale) {
  context {
    locale
  }
  root Entry(id: id, locale: locale)
  on Entry a { id }
  on Asset asset { id }
}
`;
    const { document, snapshot } = snapshotFrom(source);
    const query = (document.parseResult.value as Model).declarations.find(isQueryDeclaration)!;
    const used = usedBindingsInQuery(query, snapshot.program.queries[0]);
    expect(used.has("a")).toBe(true);
    expect(used.has("asset")).toBe(true);
    expect(uniqueProjectionBinding("Asset", used)).toBe("a2");
  });
});

describe("ZielCodeActionProvider", () => {
  it("offers Add 'on Asset' projection for MISSING_ON_PROJECTION", () => {
    const { Ziel, semanticSnapshot } = createZielLspServices(EmptyFileSystem);
    const { document, snapshot } = snapshotFrom(FIXTURE);
    semanticSnapshot.set(snapshot);

    expect(Ziel.lsp.CodeActionProvider).toBeInstanceOf(ZielCodeActionProvider);

    const provider = new ZielCodeActionProvider(Ziel, semanticSnapshot);

    const expandOffset = document.textDocument.getText().indexOf("expand image");
    expect(expandOffset).toBeGreaterThanOrEqual(0);
    const start = document.textDocument.positionAt(expandOffset);
    const end = document.textDocument.positionAt(expandOffset + "expand image".length);

    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: { start, end },
      message: "Query 'EntryDetail' expands 'Asset' but has no 'on Asset' projection",
      code: "MISSING_ON_PROJECTION",
      source: "ziel",
      data: { missingResource: "Asset" },
    };

    expect(isMissingOnDiagnostic(diagnostic)).toBe(true);

    const actions = provider.getCodeActions(document, {
      textDocument: { uri: document.uri.toString() },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] },
    });

    expect(actions).toBeDefined();
    const action = actions![0] as CodeAction;
    expect(action.title).toBe("Add 'on Asset' projection");
    expect(action.kind).toBe(CodeActionKind.QuickFix);
    const edits = action.edit?.changes?.[document.textDocument.uri];
    expect(edits?.[0]?.newText).toContain("on Asset a include properties { }");
  });

  it("offers Add all when multiple missing-on diagnostics are present", () => {
    const cache = createSemanticSnapshotCache();
    const multi = `
scalar Locale on string;
resource Page(id: string, locale: Locale): { id entryId: string assetId: string }
resource Entry(id: string, locale: Locale): { id }
resource Asset(id: string, locale: Locale): { id }
query Q(id: string, locale: Locale) {
  context {
    locale
  }
  root Page(id: id, locale: locale)
  on Page p {
    expand entry: Entry(id: p.entryId, locale: locale)
    expand asset: Asset(id: p.assetId, locale: locale)
  }
}
`;
    const { document, snapshot } = snapshotFrom(multi);
    cache.set(snapshot);
    const { Ziel } = createZielLspServices(EmptyFileSystem);
    const provider = new ZielCodeActionProvider(Ziel, cache);

    const text = document.textDocument.getText();
    const entryOff = text.indexOf("expand entry");
    const assetOff = text.indexOf("expand asset");
    const d1: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.textDocument.positionAt(entryOff),
        end: document.textDocument.positionAt(entryOff + 12),
      },
      message: "missing Entry",
      code: "MISSING_ON_PROJECTION",
      data: { missingResource: "Entry" },
    };
    const d2: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.textDocument.positionAt(assetOff),
        end: document.textDocument.positionAt(assetOff + 12),
      },
      message: "missing Asset",
      code: "MISSING_ON_PROJECTION",
      data: { missingResource: "Asset" },
    };

    const actions = provider.getCodeActions(document, {
      textDocument: { uri: document.uri.toString() },
      range: d1.range,
      context: { diagnostics: [d1, d2] },
    }) as CodeAction[];

    expect(actions.map((a) => a.title)).toEqual([
      "Add 'on Entry' projection",
      "Add 'on Asset' projection",
      "Add all missing on projections",
    ]);

    const addAll = actions[2]!;
    const edits = addAll.edit?.changes?.[document.textDocument.uri] ?? [];
    expect(edits).toHaveLength(1);
    expect(edits[0]!.newText).toContain("on Entry e include properties { }");
    expect(edits[0]!.newText).toContain("on Asset a include properties { }");
  });

  it("offers Add empty context for MISSING_CONTEXT", () => {
    const source = `
scalar Id on string;
resource Page(id: Id): { id }
query Q(id: Id) {
  root Page(id: id)
}
`;
    const { document, snapshot } = snapshotFrom(source);
    const cache = createSemanticSnapshotCache();
    cache.set(snapshot);
    const { Ziel } = createZielLspServices(EmptyFileSystem);
    const provider = new ZielCodeActionProvider(Ziel, cache);

    const text = document.textDocument.getText();
    const queryOff = text.indexOf("query Q");
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.textDocument.positionAt(queryOff),
        end: document.textDocument.positionAt(queryOff + 7),
      },
      message: "Query 'Q' must declare a context block",
      code: "MISSING_CONTEXT",
      source: "ziel",
    };

    const actions = provider.getCodeActions(document, {
      textDocument: { uri: document.uri.toString() },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] },
    }) as CodeAction[];

    expect(actions.map((a) => a.title)).toEqual(["Add empty context"]);
    expect(actions[0]!.edit?.changes?.[document.textDocument.uri]?.[0]?.newText).toBe(
      "  context { }\n\n"
    );
  });

  it("offers Add context field for QUERY_CONTEXT_MISSING_DATASOURCE_FIELD", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
datasource CmsEntries {
  context { locale: Locale }
  for Entry
}
query Q(id: EntryId) {
  context { }
  root Entry(id: id, locale: "en")
  on Entry e { id }
}
`;
    const { document, snapshot } = snapshotFrom(source);
    const cache = createSemanticSnapshotCache();
    cache.set(snapshot);
    const { Ziel } = createZielLspServices(EmptyFileSystem);
    const provider = new ZielCodeActionProvider(Ziel, cache);

    const text = document.textDocument.getText();
    const contextOff = text.indexOf("context { }");
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.textDocument.positionAt(contextOff),
        end: document.textDocument.positionAt(contextOff + 11),
      },
      message: "Query context is missing required field 'locale' (from CmsEntries)",
      code: "QUERY_CONTEXT_MISSING_DATASOURCE_FIELD",
      source: "ziel",
      data: { contextField: "locale" },
    };

    const actions = provider.getCodeActions(document, {
      textDocument: { uri: document.uri.toString() },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] },
    }) as CodeAction[];

    expect(actions.map((a) => a.title)).toEqual(["Add context field 'locale'"]);
    const edits = actions[0]!.edit?.changes?.[document.textDocument.uri] ?? [];
    expect(edits.some((e) => e.newText.includes("locale: Locale"))).toBe(true);
    expect(edits.some((e) => e.newText.includes("locale"))).toBe(true);
  });

  it("offers Remove unused context field for QUERY_CONTEXT_UNUSED_FIELD", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
datasource CmsEntries {
  context { locale: Locale }
  for Entry
}
query Q(id: EntryId, locale: Locale, unused: string) {
  context {
    locale
    unused
  }
  root Entry(id: id, locale: locale)
  on Entry e { id }
}
`;
    const { document, snapshot } = snapshotFrom(source);
    const cache = createSemanticSnapshotCache();
    cache.set(snapshot);
    const { Ziel } = createZielLspServices(EmptyFileSystem);
    const provider = new ZielCodeActionProvider(Ziel, cache);

    const text = document.textDocument.getText();
    const unusedOff = text.lastIndexOf("unused");
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Warning,
      range: {
        start: document.textDocument.positionAt(unusedOff),
        end: document.textDocument.positionAt(unusedOff + 6),
      },
      message: "Query context field 'unused' is not required by any datasource used by this query",
      code: "QUERY_CONTEXT_UNUSED_FIELD",
      source: "ziel",
      data: { contextField: "unused" },
    };

    const actions = provider.getCodeActions(document, {
      textDocument: { uri: document.uri.toString() },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] },
    }) as CodeAction[];

    expect(actions.map((a) => a.title)).toEqual(["Remove unused context field 'unused'"]);
    const edits = actions[0]!.edit?.changes?.[document.textDocument.uri] ?? [];
    expect(edits).toHaveLength(1);
    expect(edits[0]!.newText).toBe("");
  });

  it("offers Add empty roots block for EMPTY_ROOTS", () => {
    const source = `
scalar Id on string;
resource Page(id: Id): { id }
query Q(id: Id) {
  context { }
  on Page p { id }
}
`;
    const { document, snapshot } = snapshotFrom(source);
    const cache = createSemanticSnapshotCache();
    cache.set(snapshot);
    const { Ziel } = createZielLspServices(EmptyFileSystem);
    const provider = new ZielCodeActionProvider(Ziel, cache);

    const text = document.textDocument.getText();
    const queryOff = text.indexOf("query Q");
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: document.textDocument.positionAt(queryOff),
        end: document.textDocument.positionAt(queryOff + 7),
      },
      message: "Query must declare at least one root",
      code: "EMPTY_ROOTS",
      source: "ziel",
    };

    const actions = provider.getCodeActions(document, {
      textDocument: { uri: document.uri.toString() },
      range: diagnostic.range,
      context: { diagnostics: [diagnostic] },
    }) as CodeAction[];

    expect(actions.map((a) => a.title)).toEqual(["Add empty roots block"]);
    expect(actions[0]!.edit?.changes?.[document.textDocument.uri]?.[0]?.newText).toBe(
      "  roots { }\n\n"
    );
  });
});

describe("add / remove context field edits", () => {
  it("adds param and projection when both are missing", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
datasource CmsEntries {
  context { locale: Locale }
  for Entry
}
query Q(id: EntryId) {
  context { }
  root Entry(id: id, locale: "en")
  on Entry e { id }
}
`.trim();
    const { document, snapshot } = snapshotFrom(source);
    const query = (document.parseResult.value as Model).declarations.find(isQueryDeclaration)!;
    const edits = addContextFieldEditsForQuery(document, query, "locale", snapshot)!;
    expect(edits.length).toBeGreaterThanOrEqual(2);
    const joined = edits.map((e) => e.newText).join("|");
    expect(joined).toContain("locale: Locale");
    expect(joined).toMatch(/locale/);
  });

  it("removes unused projection without touching params", () => {
    const source = `
scalar EntryId on string;
scalar Locale on string;
resource Entry(id: EntryId, locale: Locale): { id }
datasource CmsEntries {
  context { locale: Locale }
  for Entry
}
query Q(id: EntryId, locale: Locale, unused: string) {
  context {
    locale
    unused
  }
  root Entry(id: id, locale: locale)
  on Entry e { id }
}
`.trim();
    const { document } = snapshotFrom(source);
    const query = (document.parseResult.value as Model).declarations.find(isQueryDeclaration)!;
    const text = document.textDocument.getText();
    const edits = removeContextFieldEditsForQuery(document, query, "unused")!;
    expect(edits).toHaveLength(1);
    const start = document.textDocument.offsetAt(edits[0]!.range.start);
    const end = document.textDocument.offsetAt(edits[0]!.range.end);
    const next = text.slice(0, start) + edits[0]!.newText + text.slice(end);
    expect(next).toContain("unused: string");
    expect(next).not.toMatch(/context \{\s*locale\s*unused/);
    expect(next).toMatch(/context \{\s*locale\s*\}/);
  });
});

describe("missing context / root insert helpers", () => {
  it("inserts empty context after the query opening brace", () => {
    const source = `
query Q() {
  root Page(id: id)
}
`.trim();
    const { document, query } = queryFrom(source);
    const text = document.textDocument.getText();
    const offset = missingContextInsertOffset(query, text)!;
    expect(missingContextInsertText()).toBe("  context { }\n\n");
    const edits = missingContextEditsForQuery(document, query)!;
    expect(applyInsert(text, offset, edits[0]!.newText)).toContain("context { }");
    expect(applyInsert(text, offset, edits[0]!.newText)).toMatch(
      /\{\n {2}context \{ \}\n\n {2}root/
    );
  });

  it("inserts empty roots block after context", () => {
    const source = `
scalar Id on string;
resource Page(id: Id): { id }
query Q(id: Id) {
  context { }
  on Page p { id }
}
`.trim();
    const { document } = snapshotFrom(source);
    const query = (document.parseResult.value as Model).declarations.find(isQueryDeclaration)!;
    const text = document.textDocument.getText();
    const offset = missingRootInsertOffset(query, text)!;
    expect(emptyRootsInsertText()).toBe("  roots { }\n\n");
    const edits = missingRootEditsForQuery(document, query)!;
    expect(applyInsert(text, offset, edits[0]!.newText)).toMatch(
      /context \{ \}\n {2}roots \{ \}\n\n {2}on Page/
    );
  });
});
