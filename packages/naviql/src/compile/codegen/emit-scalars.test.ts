import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { defScalar, span } from "../../fixtures";
import type { Program } from "../../ir";
import { parseAndCheck } from "../parse-and-check";
import { emitScalars } from "./emit-scalars";
import { generateResources } from "./generate-resources";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

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

  it("emits Branded helper + aliases for post-detail.naviql scalars", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.naviql"),
      "file:///fixtures/post-detail.naviql"
    );
    expect(diagnostics).toEqual([]);

    expect(normalizeWhitespace(emitScalars(program))).toBe(
      normalizeWhitespace(`
declare const __brand: unique symbol;
type Branded<Name extends string, T> = T & { readonly [__brand]: Name };

export type PostId = Branded<"PostId", string>;

export type UserId = Branded<"UserId", string>;

export type Locale = Branded<"Locale", string>;
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
  });
});

describe("generateResources — branded scalars", () => {
  it("includes scalar aliases and does not import runtime when only scalars exist", () => {
    const program: Program = {
      scalars: [defScalar("PostId", "string")],
      resources: [],
      queries: [],
      span,
    };

    const { code } = generateResources(program);
    expect(code).toContain('export type PostId = Branded<"PostId", string>;');
    expect(code).not.toMatch(/import\s*\{[^}]*\}\s*from/);
  });
});
