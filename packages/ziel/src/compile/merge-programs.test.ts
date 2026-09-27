import { describe, expect, it } from "vitest";

import { checkProgram } from "../check";
import {
  construct,
  defScalar,
  field,
  objectType,
  query,
  resource,
  scalarRef,
  singleRoot,
} from "../fixtures";
import type { Program, SourceSpan } from "../ir";
import { parseAndCheck } from "./parse-and-check";
import { mergePrograms } from "./merge-programs";

function fileSpan(uri: string): SourceSpan {
  return { start: 0, end: 1, uri };
}

function emptyProgram(): Program {
  return { scalars: [], resources: [], fragments: [], queries: [], span: null };
}

function programA(): Program {
  return {
    scalars: [defScalar("AId", "string")],
    resources: [
      resource(
        "A",
        [field("id", scalarRef("AId"))],
        objectType(field("id", scalarRef("AId"), true))
      ),
    ],
    fragments: [],
    queries: [],
    span: fileSpan("file:///a.ziel"),
  };
}

function programB(): Program {
  return {
    scalars: [defScalar("BId", "string")],
    resources: [
      resource(
        "B",
        [field("id", scalarRef("BId"))],
        objectType(field("id", scalarRef("BId"), true))
      ),
    ],
    fragments: [],
    queries: [
      query("QB", {
        parameters: [],
        context: [],
        roots: singleRoot(construct("B", [])),
        projections: [],
      }),
    ],
    span: fileSpan("file:///b.ziel"),
  };
}

describe("mergePrograms", () => {
  it("returns an empty program for no inputs", () => {
    expect(mergePrograms([])).toEqual(emptyProgram());
  });

  it("shallow-copies lists and clears program span for a single input", () => {
    const input = programA();
    const merged = mergePrograms([input]);

    expect(merged.span).toBeNull();
    expect(merged.scalars).toEqual(input.scalars);
    expect(merged.resources).toEqual(input.resources);
    expect(merged.queries).toEqual(input.queries);
    expect(merged.scalars).not.toBe(input.scalars);
    expect(merged.resources).not.toBe(input.resources);
    expect(merged.queries).not.toBe(input.queries);
    expect(merged.scalars[0]).toBe(input.scalars[0]);
    expect(input.span?.uri).toBe("file:///a.ziel");
  });

  it("concatenates declarations in input order and sets program span to null", () => {
    const a = programA();
    const b = programB();
    const merged = mergePrograms([a, b]);

    expect(merged.span).toBeNull();
    expect(merged.scalars.map((s) => s.name)).toEqual(["AId", "BId"]);
    expect(merged.resources.map((r) => r.name)).toEqual(["A", "B"]);
    expect(merged.queries.map((q) => q.name)).toEqual(["QB"]);
    expect(merged.scalars[0]).toBe(a.scalars[0]);
    expect(merged.scalars[1]).toBe(b.scalars[0]);
  });

  it("preserves per-node URIs from dual parse while clearing program span", () => {
    const a = parseAndCheck(
      `scalar AId on string;\nresource A(id: AId): { id }`,
      "file:///fixtures/a.ziel"
    );
    const b = parseAndCheck(
      `scalar BId on string;\nresource B(id: BId): { id }`,
      "file:///fixtures/b.ziel"
    );

    expect(a.diagnostics).toEqual([]);
    expect(b.diagnostics).toEqual([]);

    const merged = mergePrograms([a.program, b.program]);

    expect(merged.span).toBeNull();
    expect(merged.scalars[0]?.span?.uri).toBe("file:///fixtures/a.ziel");
    expect(merged.resources[0]?.span?.uri).toBe("file:///fixtures/a.ziel");
    expect(merged.scalars[1]?.span?.uri).toBe("file:///fixtures/b.ziel");
    expect(merged.resources[1]?.span?.uri).toBe("file:///fixtures/b.ziel");
  });

  it("does not resolve name collisions — checkProgram reports DUPLICATE_*", () => {
    const first: Program = {
      scalars: [defScalar("Id", "string")],
      resources: [
        resource(
          "Thing",
          [field("id", scalarRef("Id"))],
          objectType(field("id", scalarRef("Id"), true))
        ),
      ],
      fragments: [],
      queries: [],
      span: null,
    };
    const second: Program = {
      scalars: [defScalar("Id", "string")],
      resources: [
        resource(
          "Thing",
          [field("id", scalarRef("Id"))],
          objectType(field("id", scalarRef("Id"), true))
        ),
      ],
      fragments: [],
      queries: [],
      span: null,
    };

    const merged = mergePrograms([first, second]);

    expect(merged.scalars).toHaveLength(2);
    expect(merged.resources).toHaveLength(2);

    const diags = checkProgram(merged);
    expect(diags).toContainEqual(expect.objectContaining({ code: "DUPLICATE_SCALAR" }));
    expect(diags).toContainEqual(expect.objectContaining({ code: "DUPLICATE_RESOURCE" }));
  });
});
