/**
 * Golden / roundtrip tests for `.naviql` sources → parseAndCheck.
 * IR-literal checker coverage stays in check/check-program.test.ts.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { pageDetailProgram } from "../fixtures";
import { parseAndCheck } from "./parse-and-check";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function stripSpans(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSpans);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = key === "span" ? null : stripSpans(child);
    }
    return out;
  }
  return value;
}

describe("golden .naviql → parseAndCheck", () => {
  it("page-detail.naviql typechecks with no diagnostics", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("page-detail.naviql"),
      "file:///fixtures/page-detail.naviql"
    );

    expect(diagnostics).toEqual([]);
    expect(program.queries.map((q) => q.name)).toEqual(["PageDetail"]);
    expect(program.span?.uri).toBe("file:///fixtures/page-detail.naviql");
  });

  it("page-detail.naviql lowers to the same IR as pageDetailProgram (spans ignored)", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("page-detail.naviql"));

    expect(diagnostics).toEqual([]);
    expect(stripSpans(program)).toEqual(stripSpans(pageDetailProgram()));
  });

  it("post-detail.naviql typechecks with no diagnostics", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.naviql"),
      "file:///fixtures/post-detail.naviql"
    );

    expect(diagnostics).toEqual([]);
    expect(program.queries.map((q) => q.name)).toEqual(["PostDetail"]);
    expect(program.resources.map((r) => r.name)).toEqual(["Post", "User"]);
  });

  it("hero-id-mismatch.naviql reports TYPE_MISMATCH for Hero(id: @p.id)", () => {
    const { diagnostics } = parseAndCheck(
      loadFixture("hero-id-mismatch.naviql"),
      "file:///fixtures/hero-id-mismatch.naviql"
    );

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "TYPE_MISMATCH",
        message: expect.stringMatching(/PageId.*HeroId|HeroId.*PageId/),
      })
    );
    expect(diagnostics.every((d) => d.code !== "SYNTAX_ERROR")).toBe(true);
  });
});
