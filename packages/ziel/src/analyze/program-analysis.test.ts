import { describe, expect, it } from "vitest";

import { parseAndCheck } from "../compile/parse-and-check";
import { analyzeProgram } from "../check/check-program";

describe("ProgramAnalysis query plans", () => {
  it("models ordered arms, residual default reachability, and datasource coverage", () => {
    const { program, diagnostics } = parseAndCheck(`
      scalar EntryId on string;

      resource Entry(id: EntryId):
        { kind: "A", id, title: string }
        | { kind: "B", id, title: string }
        | { kind: "C", id, title: string }

      datasource Entries {
        for Entry
      }

      query Q(id: EntryId) {
        context { }
        root Entry(id: id)
        on Entry e {
          when e.kind in ["A", "B"] { id kind }
          when e.kind == "B" { id }
          when e.kind == "C" { id kind }
          default { id }
        }
      }
    `);
    expect(diagnostics).toEqual([]);

    const analysis = analyzeProgram(program);
    const query = analysis.queries[0]!;
    const projection = query.projections[0]!;

    expect(projection.kind).toBe("armed");
    expect(projection.arms.map((arm) => arm.reachable)).toEqual([true, false, true]);
    expect(projection.arms.map((arm) => arm.narrowing)).toEqual(["proven", "proven", "proven"]);
    expect(projection.defaultArm?.reachable).toBe(false);
    expect(query.datasourceCoverage).toEqual({
      referencedResources: ["Entry"],
      datasources: ["Entries"],
      uncoveredResources: [],
    });
    expect(query.reachableResources).toEqual(new Set(["Entry"]));
    expect(Object.isFrozen(query)).toBe(true);
    expect(Object.isFrozen(projection.arms)).toBe(true);
  });

  it("keeps data-dependent filters conservative", () => {
    const { program, diagnostics } = parseAndCheck(`
      scalar EntryId on string;
      resource Entry(id: EntryId):
        { kind: "A", id, title: string }
        | { kind: "B", id, title: string }

      query Q(id: EntryId) {
        context { }
        root Entry(id: id)
        on Entry e {
          when e.title == "featured" { id title }
          when e.kind == "B" { id }
          default { id }
        }
      }
    `);
    expect(diagnostics).toEqual([]);

    const projection = analyzeProgram(program).queries[0]!.projections[0]!;
    expect(projection.arms[0]).toMatchObject({ reachable: true, narrowing: "conservative" });
    expect(projection.arms[1]).toMatchObject({ reachable: true, narrowing: "proven" });
    expect(projection.defaultArm?.reachable).toBe(true);
  });
});
