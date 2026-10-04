import { describe, expect, it } from "vitest";

import { compileWorkspace } from "./compile-workspace";

function source(uri: string, value: string) {
  return { uri, source: value };
}

describe("compileWorkspace", () => {
  it("classifies named payload types against resources declared in another file", () => {
    const result = compileWorkspace([
      source(
        "file:///collections.ziel",
        `
          resource EntryCollection(id: Id): Entry[]
        `
      ),
      source(
        "file:///resources.ziel",
        `
          scalar Id on string;
          resource Entry(id: Id): { id title: string }
        `
      ),
    ]);

    expect(result.diagnostics).toEqual([]);
    const collection = result.program.resources.find(
      (resource) => resource.name === "EntryCollection"
    );
    expect(collection?.payloadType).toMatchObject({
      kind: "array",
      of: { kind: "resourceRef", name: "Entry" },
    });
  });

  it("resolves opaque payload types declared in another file", () => {
    const result = compileWorkspace([
      source(
        "file:///opaques.ziel",
        `
          opaque RichDocument;
        `
      ),
      source(
        "file:///resources.ziel",
        `
          scalar Id on string;
          resource Doc(id: Id): { id body: RichDocument }
        `
      ),
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.program.opaques.map((opaque) => opaque.name)).toEqual(["RichDocument"]);
    const doc = result.program.resources.find((resource) => resource.name === "Doc");
    expect(doc?.payloadType.kind).toBe("object");
    if (doc?.payloadType.kind !== "object") return;
    expect(doc.payloadType.fields.find((field) => field.name === "body")?.type).toMatchObject({
      kind: "opaqueRef",
      name: "RichDocument",
    });
  });

  it("expands nested fragment spreads across files", () => {
    const result = compileWorkspace([
      source(
        "file:///resources.ziel",
        `
          scalar Id on string;
          resource Entry(id: Id): { id title: string }
        `
      ),
      source("file:///details.ziel", `fragment EntryDetails on Entry entry { ...EntryId title }`),
      source("file:///base.ziel", `fragment EntryId on Entry entry { id }`),
      source(
        "file:///query.ziel",
        `
          query EntryDetail(id: Id) {
            context { }
            root Entry(id: id)
            on Entry entry { ...EntryDetails }
          }
        `
      ),
    ]);

    expect(result.diagnostics).toEqual([]);
    expect(result.program.queries[0]?.projections[0]?.selectedFields).toEqual(["id", "title"]);
  });

  it("detects fragment cycles across files without false UNKNOWN_FRAGMENT", () => {
    const result = compileWorkspace([
      source("file:///resources.ziel", `scalar Id on string; resource Entry(id: Id): { id }`),
      source("file:///a.ziel", `fragment A on Entry entry { ...B }`),
      source("file:///b.ziel", `fragment B on Entry entry { ...A }`),
    ]);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "FRAGMENT_CYCLE" }));
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "UNKNOWN_FRAGMENT")).toBe(
      false
    );
  });

  it("uses the first cross-file fragment declaration and locates the duplicate", () => {
    const result = compileWorkspace([
      source(
        "file:///resources.ziel",
        `scalar Id on string; resource Entry(id: Id): { id title: string }`
      ),
      source("file:///first.ziel", `fragment Shared on Entry entry { id }`),
      source("file:///second.ziel", `fragment Shared on Entry entry { title }`),
      source(
        "file:///query.ziel",
        `
          query Q(id: Id) {
            context { }
            root Entry(id: id)
            on Entry entry { ...Shared }
          }
        `
      ),
    ]);

    const duplicates = result.lowerDiagnostics.filter(
      (diagnostic) => diagnostic.code === "DUPLICATE_FRAGMENT"
    );
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.span?.uri).toBe("file:///second.ziel");
    expect(result.program.fragments).toHaveLength(1);
    expect(result.program.queries[0]?.projections[0]?.selectedFields).toEqual(["id"]);
  });

  it("excludes syntax-invalid files while analyzing valid files", () => {
    const result = compileWorkspace([
      source("file:///valid.ziel", `scalar Id on string; resource Entry(id: Id): { id }`),
      source("file:///broken.ziel", `resource Broken(`),
    ]);

    expect(result.validSourceCount).toBe(1);
    expect(result.syntaxDiagnostics.length).toBeGreaterThan(0);
    expect(result.syntaxDiagnostics.every((diagnostic) => diagnostic.code === "SYNTAX_ERROR")).toBe(
      true
    );
    expect(result.program.resources.map((resource) => resource.name)).toEqual(["Entry"]);
  });
});
