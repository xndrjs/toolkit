/**
 * Phase 6 — projection / datasource opaque integration (no resolver changes).
 *
 * Verifies that opaque values are transported by existing generic projection
 * and datasource typing: selected-field assign, include all/properties,
 * root-opaque empty projection identity, ContentRegistry branding, and
 * adapter `RichDocument.wrap(raw)`.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { analyzeProgram } from "../../check";
import { isObjectLikePayload } from "../../check/discriminants";
import { opaqueRef } from "../../fixtures";
import { defineOpaqueType } from "../../opaque";
import { parseAndCheck } from "../parse-and-check";
import { composeGeneratedModule } from "./compose-generated-module";
import { emitProjections } from "./projections/emit-projections";
import { emitProjectionTypes } from "./projections/emit-projection-types";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");

const opaqueProgram = `
  opaque RichDocument;
  opaque MediaDescriptor;
  scalar ArticleId on string;

  resource Article(id: ArticleId): {
    id
    title: string
    body: RichDocument
    media?: MediaDescriptor | null
    relatedId: ArticleId refers Article
  }

  resource ExternalDocument(id: ArticleId): RichDocument

  datasource InMemory {
    context { }
    for Article
    for ExternalDocument
  }

  query ArticleDetail(id: ArticleId) {
    context { }
    root Article(id: id)
    on Article a {
      id
      body
      media
    }
  }

  query ArticleInclude(id: ArticleId) {
    context { }
    root Article(id: id)
    on Article a include all { }
  }

  query ArticleProperties(id: ArticleId) {
    context { }
    root Article(id: id)
    on Article a include properties { }
  }

  query ExternalDetail(id: ArticleId) {
    context { }
    root ExternalDocument(id: id)
    on ExternalDocument document { }
  }
`;

function compileStrict(source: string): readonly ts.Diagnostic[] {
  const virtualPath = join(repoRoot, "packages/ziel/src/__opaque-projection-fixture.ts");
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

function renderDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  );
}

describe("opaque projection / datasource integration", () => {
  it("treats opaque payloads as non-object-like (empty projection / no include narrowing)", () => {
    expect(isObjectLikePayload(opaqueRef("RichDocument"), new Map())).toBe(false);
  });

  it("copies selected opaque fields with a plain payload assign (no transform)", () => {
    const { program, diagnostics } = parseAndCheck(opaqueProgram);
    expect(diagnostics).toEqual([]);

    const analysis = analyzeProgram(program);
    const articleDetail = analysis.queries.find((q) => q.query.name === "ArticleDetail")!;
    expect(articleDetail.projections[0]!.flatBody!.selectedFields).toEqual(["id", "body", "media"]);

    const code = emitProjections(analysis);
    const projectOnArticle = code.slice(
      code.indexOf("const projectOnArticle"),
      code.indexOf("const projectNode")
    );

    expect(projectOnArticle).toContain("shell.body = payload.body;");
    expect(projectOnArticle).toContain("shell.media = payload.media;");
    expect(projectOnArticle).not.toContain("RichDocument.wrap");
    expect(projectOnArticle).not.toContain("RichDocument.unwrap");
    expect(projectOnArticle).not.toContain("structuredClone");
    expect(projectOnArticle).not.toContain("JSON.");
  });

  it("include all and include properties auto-include opaque non-refers fields", () => {
    const { program, diagnostics } = parseAndCheck(opaqueProgram);
    expect(diagnostics).toEqual([]);

    const analysis = analyzeProgram(program);
    const includeAll = analysis.queries.find((q) => q.query.name === "ArticleInclude")!;
    const includeProperties = analysis.queries.find((q) => q.query.name === "ArticleProperties")!;

    expect(includeAll.projections[0]!.flatBody!.selectedFields).toEqual([
      "id",
      "title",
      "body",
      "media",
      "relatedId",
    ]);
    // Opaque fields have no refers; include properties keeps them and drops refers edges.
    expect(includeProperties.projections[0]!.flatBody!.selectedFields).toEqual([
      "id",
      "title",
      "body",
      "media",
    ]);

    const types = emitProjectionTypes(analysis);
    expect(types).toMatch(/export type ArticleInclude_Article\s*=\s*\{[\s\S]*body: RichDocument;/);
    expect(types).toMatch(
      /export type ArticleProperties_Article\s*=\s*\{[\s\S]*body: RichDocument;/
    );
    expect(types).toMatch(
      /export type ArticleProperties_Article\s*=\s*\{[\s\S]*media\?: MediaDescriptor \| null;/
    );
    expect(types).not.toMatch(/export type ArticleProperties_Article\s*=\s*\{[\s\S]*relatedId:/);

    const projections = emitProjections(analysis);
    expect(projections).toContain("shell.body = payload.body;");
    expect(projections).toContain("shell.media = payload.media;");
  });

  it("root opaque empty projection returns the payload reference unchanged", () => {
    const { program, diagnostics } = parseAndCheck(opaqueProgram);
    expect(diagnostics).toEqual([]);

    const analysis = analyzeProgram(program);
    const external = analysis.queries.find((q) => q.query.name === "ExternalDetail")!;
    expect(external.projections[0]!.flatBody!.selectedFields).toEqual([]);

    const types = emitProjectionTypes(analysis);
    expect(types).toContain(
      "export type ExternalDetail_ExternalDocument = ExternalDocumentPayload;"
    );

    const generated = composeGeneratedModule(analysis).code;
    expect(generated).toContain("export type ExternalDocumentPayload = RichDocument;");

    const code = emitProjections(analysis);
    const projectOnExternal = code.slice(
      code.indexOf("const projectOnExternalDocument"),
      code.indexOf("const projectNode", code.indexOf("const projectOnExternalDocument"))
    );
    expect(projectOnExternal).toContain("memo.set(resource.toString(), inputPayload);");
    expect(projectOnExternal).toContain("return inputPayload;");
    expect(projectOnExternal).not.toContain("const shell");

    // Same reference contract as the emitted passthrough (`return inputPayload`).
    const RichDocument = defineOpaqueType("RichDocument");
    const raw = { blocks: [{ type: "paragraph" }] };
    const wrapped = RichDocument.wrap(raw);
    const projected = ((inputPayload: typeof wrapped) => inputPayload)(wrapped);
    expect(Object.is(projected, wrapped)).toBe(true);
    expect(Object.is(projected, raw)).toBe(true);
  });

  it("ContentRegistry and datasource load require branded opaque payloads", () => {
    const { program, diagnostics } = parseAndCheck(opaqueProgram);
    expect(diagnostics).toEqual([]);

    const generated = composeGeneratedModule(analyzeProgram(program)).code;

    expect(generated).toContain("export type ContentRegistry = {");
    expect(generated).toContain("Article: ArticlePayload;");
    expect(generated).toContain("ExternalDocument: ExternalDocumentPayload;");
    expect(generated).toContain("body: RichDocument;");
    expect(generated).toContain("export type ExternalDocumentPayload = RichDocument;");
    expect(generated).toContain(
      ") => Promise<readonly (ArticlePayload | ExternalDocumentPayload | undefined)[]>;"
    );
    expect(generated).not.toMatch(/body:\s*unknown/);
    expect(generated).not.toMatch(/ExternalDocumentPayload\s*=\s*unknown/);
  });

  it("strict-checks adapter wrap into datasource load and projection result types", () => {
    const { program, diagnostics } = parseAndCheck(opaqueProgram);
    expect(diagnostics).toEqual([]);

    const generated = composeGeneratedModule(analyzeProgram(program)).code;
    const withAdapter = `${generated}

declare function useArticle(article: ArticleDetail_Article): void;
declare function useExternal(document: ExternalDetailResult): void;

const rawBody = { blocks: [{ type: "paragraph" }] };
const rawMedia = { kind: "image", uri: "mem://thumb" };

const articlePayload: ArticlePayload = {
  id: Scalars.ArticleId("a1"),
  title: "Hello",
  body: RichDocument.wrap(rawBody),
  media: MediaDescriptor.wrap(rawMedia),
  relatedId: Scalars.ArticleId("a2"),
};

const externalPayload: ExternalDocumentPayload = RichDocument.wrap(rawBody);

const sources = createArticleDetailDataSources({
  InMemory: {
    load: async () => [articlePayload, externalPayload],
  },
});
void sources;

useArticle({
  id: articlePayload.id,
  body: articlePayload.body,
  media: articlePayload.media,
});
useExternal(externalPayload);
`;

    expect(renderDiagnostics(compileStrict(withAdapter))).toEqual([]);
  });

  it("rejects unwrapped unknown values where branded opaque is required", () => {
    const { program, diagnostics } = parseAndCheck(opaqueProgram);
    expect(diagnostics).toEqual([]);

    const generated = composeGeneratedModule(analyzeProgram(program)).code;
    const withoutWrap = `${generated}

const rawBody = { blocks: [{ type: "paragraph" }] };

const articlePayload: ArticlePayload = {
  id: Scalars.ArticleId("a1"),
  title: "Hello",
  body: rawBody,
  relatedId: Scalars.ArticleId("a2"),
};
void articlePayload;
`;

    const rendered = renderDiagnostics(compileStrict(withoutWrap));
    expect(rendered.length).toBeGreaterThan(0);
    expect(
      rendered.some((message) => /RichDocument|opaqueBrand|not assignable/i.test(message))
    ).toBe(true);
  });
});
