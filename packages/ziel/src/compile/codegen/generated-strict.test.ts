import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { analyzeProgram } from "../../check";
import { parseAndCheck } from "../parse-and-check";
import { composeGeneratedModule } from "./compose-generated-module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");

function compileStrict(source: string): readonly ts.Diagnostic[] {
  const virtualPath = join(repoRoot, "packages/ziel/src/__generated-strict-fixture.ts");
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
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  host.fileExists = (path) => path === virtualPath || originalFileExists(path);
  host.readFile = (path) => (path === virtualPath ? source : originalReadFile(path));
  host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) =>
    path === virtualPath
      ? ts.createSourceFile(path, source, languageVersion, true, ts.ScriptKind.TS)
      : originalGetSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);

  const program = ts.createProgram([virtualPath], options, host);
  return ts.getPreEmitDiagnostics(program);
}

describe("generated TypeScript", () => {
  it("passes the TypeScript strict checker", () => {
    const fixture = readFileSync(join(here, "../../fixtures/page-detail.ziel"), "utf8");
    const parsed = parseAndCheck(fixture);
    expect(parsed.diagnostics).toEqual([]);

    const analysis = analyzeProgram(parsed.program);
    const generated = composeGeneratedModule(analysis).code;
    const diagnostics = compileStrict(generated);
    const rendered = diagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );

    expect(rendered).toEqual([]);
    expect(generated).not.toMatch(/\bas any\b|:\s*any\b|any\[\]/);
    expect(generated).toContain("satisfies Partial<PageDetail_Page>");
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

    const generated = composeGeneratedModule(analyzeProgram(parsed.program)).code;
    const rendered = compileStrict(generated).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );

    expect(rendered).toEqual([]);
    expect(generated).not.toMatch(/\bas any\b|:\s*any\b|any\[\]/);
    expect(generated).toContain('&& !(predicate.payload.kind == "Hero")');
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

    const generated = composeGeneratedModule(analyzeProgram(parsed.program)).code;
    const rendered = compileStrict(generated).map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    );

    expect(rendered).toEqual([]);
    expect(generated).toContain("return inputPayload;");
  });
});
