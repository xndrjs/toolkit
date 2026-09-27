import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { defScalar, span } from "../../../fixtures";
import type { Program } from "../../../ir";
import { parseAndCheck } from "../../parse-and-check";
import { emitScalars } from "./emit-scalars";
import { generateResources } from "../generators/generate-resources";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function normalizeWhitespace(code: string): string {
  return code.trim().replace(/\n{3,}/g, "\n\n");
}

describe("emitScalars", () => {
  it("returns empty string when there are no scalars", () => {
    const program: Program = {
      scalars: [],
      resources: [],
      queries: [],
      span,
    };
    expect(emitScalars(program)).toBe("");
  });

  it("emits Branded helper + aliases + Scalars factories for post-detail.ziel", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.ziel"),
      "file:///fixtures/post-detail.ziel"
    );
    expect(diagnostics).toEqual([]);

    expect(normalizeWhitespace(emitScalars(program))).toBe(
      normalizeWhitespace(`
declare const __brand: unique symbol;
type Branded<Name extends string, T> = T & { readonly [__brand]: Name };

export type PostId = Branded<"PostId", string>;

export type UserId = Branded<"UserId", string>;

export type Locale = Branded<"Locale", string>;

export const Scalars = {
  PostId: (value: string): PostId => value as PostId,
  UserId: (value: string): UserId => value as UserId,
  Locale: (value: string): Locale => value as Locale,
} as const;
`)
    );
  });

  it("maps number / boolean representations to TS primitives", () => {
    const program: Program = {
      scalars: [defScalar("Count", "number"), defScalar("Flag", "boolean")],
      resources: [],
      queries: [],
      span,
    };

    const code = emitScalars(program);
    expect(code).toContain(`export type Count = Branded<"Count", number>;`);
    expect(code).toContain(`export type Flag = Branded<"Flag", boolean>;`);
    expect(code).toContain(`Count: (value: number): Count => value as Count,`);
    expect(code).toContain(`Flag: (value: boolean): Flag => value as Flag,`);
    expect(code).not.toMatch(/\bcount\s*[:=]/);
    expect(code).not.toMatch(/\bflag\s*[:=]/);
  });

  it("does not emit uncapitalized top-level factory functions", () => {
    const program: Program = {
      scalars: [defScalar("EntryId", "string"), defScalar("Locale", "string")],
      resources: [],
      queries: [],
      span,
    };

    const code = emitScalars(program);
    expect(code).toContain("export const Scalars = {");
    expect(code).toContain("EntryId: (value: string): EntryId => value as EntryId,");
    expect(code).not.toMatch(/export function entryId/);
    expect(code).not.toMatch(/export const entryId/);
    expect(code).not.toMatch(/^export function /m);
  });
});

describe("generateResources — branded scalars", () => {
  it("includes scalar aliases, Scalars namespace, and does not import runtime when only scalars exist", () => {
    const program: Program = {
      scalars: [defScalar("PostId", "string")],
      resources: [],
      queries: [],
      span,
    };

    const { code } = generateResources(program);
    expect(code).toContain('export type PostId = Branded<"PostId", string>;');
    expect(code).toContain("export const Scalars = {");
    expect(code).toContain("PostId: (value: string): PostId => value as PostId,");
    expect(code).not.toMatch(/import\s*\{[^}]*\}\s*from/);
  });
});
