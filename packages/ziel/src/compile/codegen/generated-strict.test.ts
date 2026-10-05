import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import { analyzeProgram } from "../../check";
import { parseAndCheck } from "../parse-and-check";
import { composeGeneratedModules, type GeneratedModuleFile } from "./compose-generated-module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

function compileStrictFiles(files: readonly GeneratedModuleFile[]): readonly ts.Diagnostic[] {
  const outDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-strict-"));
  tempDirs.push(outDir);

  const entryPaths: string[] = [];
  for (const file of files) {
    const absolute = join(outDir, file.relativePath);
    writeFileSync(absolute, file.code);
    entryPaths.push(absolute);
  }

  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    baseUrl: repoRoot,
    paths: {
      "@xndrjs/ziel": ["packages/ziel/src/index.ts"],
      "@xndrjs/addressable-resources": ["packages/addressable-resources/src/index.ts"],
      "@xndrjs/resource-graph-resolver": ["packages/resource-graph-resolver/src/index.ts"],
    },
  };

  const host = ts.createCompilerHost(options);
  const program = ts.createProgram(entryPaths, options, host);
  return ts.getPreEmitDiagnostics(program);
}

function expectNoAny(code: string): void {
  expect(code).not.toMatch(/\bas any\b|:\s*any\b|any\[\]/);
}

describe("generated TypeScript", () => {
  it("passes the TypeScript strict checker (multi-file product path)", () => {
    const fixture = readFileSync(join(here, "../../fixtures/page-detail.ziel"), "utf8");
    const parsed = parseAndCheck(fixture);
    expect(parsed.diagnostics).toEqual([]);

    const analysis = analyzeProgram(parsed.program);
    const { files } = composeGeneratedModules(analysis);
    expect(files.map((f) => f.relativePath)).toEqual(["resources.ts", "PageDetail.query.ts"]);

    const diagnostics = compileStrictFiles(files);
    const rendered = diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );

    expect(rendered).toEqual([]);
    for (const file of files) {
      expectNoAny(file.code);
    }
    const page = files.find((f) => f.relativePath === "PageDetail.query.ts")!;
    expect(page.code).toContain("satisfies Partial<PageDetail_Page>");
  });

  it("strict-checks overlapping first-match arms with a default expansion", () => {
    const parsed = parseAndCheck(`
      scalar EntryId on string;
      resource Entry(id: EntryId): {
        id
        kind: "Hero" | "Page"
        title: string
        childId: EntryId
      }
      resource Asset(id: EntryId): { id }

      query Q(id: EntryId) {
        context { }
        root Entry(id: id)
        on Entry e {
          when e.title == "featured" {
            expand featured: Asset(id: e.childId)
          }
          when e.kind == "Hero" {
            expand hero: Asset(id: e.childId)
          }
          default {
            expand fallback: Asset(id: e.childId)
          }
        }
        on Asset a { id }
      }
    `);
    expect(parsed.diagnostics).toEqual([]);

    const { files } = composeGeneratedModules(analyzeProgram(parsed.program));
    const rendered = compileStrictFiles(files).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );

    expect(rendered).toEqual([]);
    const query = files.find((f) => f.relativePath === "Q.query.ts")!;
    expectNoAny(query.code);
    expect(query.code).toContain('&& !(predicate.payload.kind == "Hero")');
  });

  it("strict-checks non-object payload passthrough", () => {
    const parsed = parseAndCheck(`
      scalar CollectionId on string;
      resource Collection(id: CollectionId): string[]

      query Q(id: CollectionId) {
        context { }
        root Collection(id: id)
        on Collection collection { }
      }
    `);
    expect(parsed.diagnostics).toEqual([]);

    const { files } = composeGeneratedModules(analyzeProgram(parsed.program));
    const rendered = compileStrictFiles(files).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );

    expect(rendered).toEqual([]);
    const query = files.find((f) => f.relativePath === "Q.query.ts")!;
    expect(query.code).toContain("return inputPayload;");
  });

  it("strict-checks a datasource and query with empty contexts", () => {
    const parsed = parseAndCheck(`
      scalar Id on string;
      resource Item(id: Id): { id }

      datasource InMemory {
        context { }
        for Item
      }

      query Q(id: Id) {
        context { }
        root Item(id: id)
        on Item item { id }
      }
    `);
    expect(parsed.diagnostics).toEqual([]);

    const { files } = composeGeneratedModules(analyzeProgram(parsed.program));
    const rendered = compileStrictFiles(files).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );

    expect(rendered).toEqual([]);
    const resources = files.find((f) => f.relativePath === "resources.ts")!;
    const query = files.find((f) => f.relativePath === "Q.query.ts")!;
    expect(resources.code).toContain("export type InMemoryContext = unknown;");
    expect(query.code).toContain("DataSource<ContentRegistry, unknown>[]");
  });

  it("strict-checks opaque tokens, payload fields, datasource, and projection typing", () => {
    const parsed = parseAndCheck(`
      opaque RichDocument;
      opaque MediaDescriptor;
      scalar ArticleId on string;
      resource Article(id: ArticleId): {
        id
        body: RichDocument
        media?: MediaDescriptor | null
      }

      datasource InMemory {
        context { }
        for Article
      }

      query Q(id: ArticleId) {
        context { }
        root Article(id: id)
        on Article a {
          id
          body
          media
        }
      }
    `);
    expect(parsed.diagnostics).toEqual([]);

    const { files } = composeGeneratedModules(analyzeProgram(parsed.program));
    const rendered = compileStrictFiles(files).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );

    expect(rendered).toEqual([]);
    for (const file of files) {
      expectNoAny(file.code);
    }
    const resources = files.find((f) => f.relativePath === "resources.ts")!;
    expect(resources.code).toContain("import { ari, s, defineOpaqueType, type OpaqueValueOf");
    expect(resources.code).toContain(
      'export const RichDocument = defineOpaqueType("RichDocument");'
    );
    expect(resources.code).toContain(
      "export type RichDocument = OpaqueValueOf<typeof RichDocument>;"
    );
    expect(resources.code).toContain("body: RichDocument;");
    expect(resources.code).toContain("media?: MediaDescriptor | null;");
  });

  it("strict-checks opaque-only programs without ari/s imports", () => {
    const parsed = parseAndCheck(`
      opaque ExternalPayload;
      opaque RichDocument;
    `);
    expect(parsed.diagnostics).toEqual([]);

    const { files } = composeGeneratedModules(analyzeProgram(parsed.program));
    expect(files.map((f) => f.relativePath)).toEqual(["resources.ts"]);

    const rendered = compileStrictFiles(files).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );

    expect(rendered).toEqual([]);
    const resources = files.find((f) => f.relativePath === "resources.ts")!;
    expect(resources.code).toContain(
      'import { defineOpaqueType, type OpaqueValueOf } from "@xndrjs/ziel";'
    );
    expect(resources.code).not.toContain("ari");
    expect(resources.code).not.toMatch(/[{,]\s*s\s*[,}]/);
    expectNoAny(resources.code);
  });
});
