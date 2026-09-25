import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseAndCheck } from "./parse-and-check";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

describe("parseAndCheck", () => {
  it("parses, lowers, and typechecks page-detail.naviql with no diagnostics", () => {
    const source = readFileSync(join(fixturesDir, "page-detail.naviql"), "utf8");
    const { program, diagnostics } = parseAndCheck(source, "file:///fixtures/page-detail.naviql");

    expect(diagnostics).toEqual([]);
    expect(program.queries.map((q) => q.name)).toEqual(["PageDetail"]);
    expect(program.span?.uri).toBe("file:///fixtures/page-detail.naviql");
  });

  it("reports SYNTAX_ERROR for invalid source without throwing", () => {
    const { program, diagnostics } = parseAndCheck("scalar X on");

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.code === "SYNTAX_ERROR")).toBe(true);
    expect(program).toEqual({
      scalars: [],
      resources: [],
      queries: [],
      span: null,
    });
  });

  it("reports TYPE_MISMATCH for Hero(id: @p.id) from source", () => {
    const { diagnostics } = parseAndCheck(`
      scalar PageId on string;
      scalar HeroId on string;
      scalar Locale on string;

      resource Page(id: PageId, locale: Locale): {
        id
        heroId: HeroId
      }

      resource Hero(id: HeroId, locale: Locale): {
        id
      }

      query Bad(pageId: PageId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand hero: Hero(id: @p.id, locale: context.locale)
        }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "TYPE_MISMATCH",
        message: expect.stringMatching(/PageId.*HeroId|HeroId.*PageId/),
      })
    );
    expect(diagnostics.every((d) => d.code !== "SYNTAX_ERROR")).toBe(true);
  });
});
