import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseAndCheck } from "./parse-and-check";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("parseAndCheck", () => {
  it("returns program + empty diagnostics for valid source", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("page-detail.ziel"),
      "file:///fixtures/page-detail.ziel"
    );

    expect(diagnostics).toEqual([]);
    expect(program.queries).toHaveLength(1);
    expect(program.span?.uri).toBe("file:///fixtures/page-detail.ziel");
  });

  it("reports SYNTAX_ERROR for invalid source without throwing", () => {
    const { program, diagnostics } = parseAndCheck("scalar X on");

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.code === "SYNTAX_ERROR")).toBe(true);
    expect(program).toEqual({
      scalars: [],
      opaques: [],
      resources: [],
      fragments: [],
      datasources: [],
      queries: [],
      span: null,
    });
  });

  it("surfaces semantic diagnostics from source without SYNTAX_ERROR", () => {
    const { diagnostics } = parseAndCheck(loadFixture("hero-id-mismatch.ziel"));

    expect(diagnostics.some((d) => d.code === "TYPE_MISMATCH")).toBe(true);
    expect(diagnostics.every((d) => d.code !== "SYNTAX_ERROR")).toBe(true);
  });
});
