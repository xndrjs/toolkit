import { describe, expect, it } from "vitest";

import { defOpaque, defScalar, span } from "../../../fixtures";
import type { Program } from "../../../ir";
import { analyzeProgram } from "../../../check";
import { parseAndCheck } from "../../parse-and-check";
import { composeGeneratedModule } from "../compose-generated-module";
import { generateResources } from "../generators/generate-resources";
import { emitOpaques } from "./emit-opaques";

function normalizeWhitespace(code: string): string {
  return code.trim().replace(/\n{3,}/g, "\n\n");
}

function emptyProgram(overrides: Partial<Program> = {}): Program {
  return {
    scalars: [],
    opaques: [],
    resources: [],
    fragments: [],
    datasources: [],
    queries: [],
    span,
    ...overrides,
  };
}

describe("emitOpaques", () => {
  it("returns empty string when there are no opaques", () => {
    expect(emitOpaques(emptyProgram())).toBe("");
  });

  it("emits token + OpaqueValueOf alias for each opaque", () => {
    const program = emptyProgram({
      opaques: [defOpaque("RichDocument"), defOpaque("MediaDescriptor")],
    });

    expect(normalizeWhitespace(emitOpaques(program))).toBe(
      normalizeWhitespace(`
export const RichDocument = defineOpaqueType("RichDocument");
export type RichDocument = OpaqueValueOf<typeof RichDocument>;

export const MediaDescriptor = defineOpaqueType("MediaDescriptor");
export type MediaDescriptor = OpaqueValueOf<typeof MediaDescriptor>;
`)
    );
  });
});

describe("generateResources — opaques", () => {
  it("imports defineOpaqueType / OpaqueValueOf for opaque-only programs (no ari/s)", () => {
    const program = emptyProgram({
      opaques: [defOpaque("ExternalPayload")],
    });

    const { code } = generateResources(program);
    expect(code).toContain('import { defineOpaqueType, type OpaqueValueOf } from "@xndrjs/ziel";');
    expect(code).not.toContain("ari");
    expect(code).not.toMatch(/[{,]\s*s\s*[,}]/);
    expect(code).toContain('export const ExternalPayload = defineOpaqueType("ExternalPayload");');
    expect(code).toContain("export type ExternalPayload = OpaqueValueOf<typeof ExternalPayload>;");
  });

  it("keeps ari/s imports and adds opaque symbols when resources and opaques coexist", () => {
    const { program, diagnostics } = parseAndCheck(`
      opaque RichDocument;
      scalar ArticleId on string;
      resource Article(id: ArticleId): {
        id
        title: string
        body: RichDocument
      }
    `);
    expect(diagnostics).toEqual([]);

    const { code } = generateResources(program);
    expect(code).toContain(
      'import { ari, s, defineOpaqueType, type OpaqueValueOf } from "@xndrjs/ziel";'
    );
    expect(code).toContain('export const RichDocument = defineOpaqueType("RichDocument");');
    expect(code).toContain("body: RichDocument;");
    // Scalars before opaques before ARIs.
    const scalarIdx = code.indexOf("export type ArticleId");
    const opaqueIdx = code.indexOf("export const RichDocument");
    const ariIdx = code.indexOf("export const articleAri");
    expect(scalarIdx).toBeGreaterThan(-1);
    expect(opaqueIdx).toBeGreaterThan(scalarIdx);
    expect(ariIdx).toBeGreaterThan(opaqueIdx);
  });

  it("does not import opaque runtime symbols when the program has no opaques", () => {
    const program = emptyProgram({
      scalars: [defScalar("PostId", "string")],
    });

    const { code } = generateResources(program);
    expect(code).not.toContain("defineOpaqueType");
    expect(code).not.toContain("OpaqueValueOf");
    expect(code).not.toMatch(/import\s*\{[^}]*\}\s*from/);
  });

  it("emits nested opaque fields, nullable, array, and union members by name", () => {
    const { program, diagnostics } = parseAndCheck(`
      opaque RichDocument;
      opaque MediaDescriptor;
      scalar Id on string;
      resource Doc(id: Id): {
        id
        body: RichDocument
        media?: MediaDescriptor | null
        attachments: RichDocument[]
        either: RichDocument | MediaDescriptor
      }
    `);
    expect(diagnostics).toEqual([]);

    const { code } = generateResources(program);
    expect(code).toContain("body: RichDocument;");
    expect(code).toContain("media?: MediaDescriptor | null;");
    expect(code).toContain("attachments: RichDocument[];");
    expect(code).toContain("either: RichDocument | MediaDescriptor;");
  });

  it("emits root opaque payload as the opaque type name", () => {
    const { program, diagnostics } = parseAndCheck(`
      opaque ExternalPayload;
      scalar Id on string;
      resource Blob(id: Id): ExternalPayload
    `);
    expect(diagnostics).toEqual([]);

    const { code } = generateResources(program);
    expect(code).toContain("export type BlobPayload = ExternalPayload;");
    expect(code).toContain("Blob: BlobPayload;");
  });
});

describe("composeGeneratedModule — opaques", () => {
  it("types datasource load returns and projection shells with opaque names", () => {
    const parsed = parseAndCheck(`
      opaque RichDocument;
      scalar Id on string;
      resource Article(id: Id): {
        id
        body: RichDocument
      }

      datasource InMemory {
        context { }
        for Article
      }

      query Q(id: Id) {
        context { }
        root Article(id: id)
        on Article a {
          id
          body
        }
      }
    `);
    expect(parsed.diagnostics).toEqual([]);

    const code = composeGeneratedModule(analyzeProgram(parsed.program)).code;
    expect(code).toContain(
      "import { ari, s, defineOpaqueType, type OpaqueValueOf, createGraphResolutionStrategy"
    );
    expect(code).toContain('export const RichDocument = defineOpaqueType("RichDocument");');
    expect(code).toContain("body: RichDocument;");
    expect(code).toContain("Promise<readonly (ArticlePayload | undefined)[]>");
    expect(code).toMatch(/export type Q_Article\s*=\s*\{[\s\S]*body: RichDocument;/);
  });

  it("matches generateResources byte-for-byte when the program has no queries", () => {
    const { program, diagnostics } = parseAndCheck(`
      opaque MediaDescriptor;
      scalar Id on string;
      resource Asset(id: Id): {
        id
        descriptor: MediaDescriptor
      }
    `);
    expect(diagnostics).toEqual([]);

    expect(composeGeneratedModule(program).code).toBe(generateResources(program).code);
  });
});
