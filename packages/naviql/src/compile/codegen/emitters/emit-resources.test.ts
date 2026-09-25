import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { defScalar, field, objectType, prim, resource, scalarRef, span } from "../../../fixtures";
import type { Program } from "../../../ir";
import { parseAndCheck } from "../../parse-and-check";
import { emitResources } from "./emit-resources";
import { generateResources } from "../generators/generate-resources";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function normalizeWhitespace(code: string): string {
  return code.trim().replace(/\n{3,}/g, "\n\n");
}

describe("emitResources", () => {
  it("returns empty string when there are no resources", () => {
    const program: Program = {
      scalars: [],
      resources: [],
      queries: [],
      span,
    };
    expect(emitResources(program)).toBe("");
  });

  it("emits Post + User factories from post-detail.naviql", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.naviql"),
      "file:///fixtures/post-detail.naviql"
    );
    expect(diagnostics).toEqual([]);

    expect(normalizeWhitespace(emitResources(program))).toBe(
      normalizeWhitespace(`
export const postAri = ari(
  "Post",
  s.object({ id: s.string(), locale: s.string() }),
);
export type PostResource = ReturnType<typeof postAri>;

export const userAri = ari(
  "User",
  s.object({ id: s.string() }),
);
export type UserResource = ReturnType<typeof userAri>;
`)
    );
  });

  it("maps number / boolean identity fields to s.int() / s.boolean()", () => {
    const program: Program = {
      scalars: [defScalar("Count", "number"), defScalar("Flag", "boolean")],
      resources: [
        resource(
          "Counter",
          [field("n", scalarRef("Count")), field("on", scalarRef("Flag"))],
          objectType(field("n", scalarRef("Count"), true))
        ),
        resource("Raw", [field("n", prim("number")), field("on", prim("boolean"))], objectType()),
      ],
      queries: [],
      span,
    };

    const code = emitResources(program);
    expect(code).toContain("s.object({ n: s.int(), on: s.boolean() })");
    expect(code).toContain("export const counterAri = ari(");
    expect(code).toContain("export type CounterResource = ReturnType<typeof counterAri>;");
    expect(code).toContain("export const rawAri = ari(");
  });

  it("uses resource.ariType for the ari() type string", () => {
    const program: Program = {
      scalars: [defScalar("PostId", "string")],
      resources: [
        {
          name: "Post",
          ariType: "cms.post",
          identity: { fields: [field("id", scalarRef("PostId"))] },
          payloadType: objectType(field("id", scalarRef("PostId"), true)),
          span,
        },
      ],
      queries: [],
      span,
    };

    expect(emitResources(program)).toContain('ari(\n  "cms.post",');
  });

  it("preserves identity field order", () => {
    const program: Program = {
      scalars: [defScalar("A", "string"), defScalar("B", "string")],
      resources: [
        resource(
          "Pair",
          [field("second", scalarRef("B")), field("first", scalarRef("A"))],
          objectType()
        ),
      ],
      queries: [],
      span,
    };

    expect(emitResources(program)).toContain("s.object({ second: s.string(), first: s.string() })");
  });
});

describe("generateResources — ARI factories", () => {
  it("imports ari/s and includes Post/User factories for post-detail", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.naviql"),
      "file:///fixtures/post-detail.naviql"
    );
    expect(diagnostics).toEqual([]);

    const { code } = generateResources(program);
    expect(code).toContain('import { ari, s } from "@xndrjs/naviql";');
    expect(code).toContain("export const postAri = ari(");
    expect(code).toContain("export type PostResource = ReturnType<typeof postAri>;");
    expect(code).toContain("export const userAri = ari(");
    expect(code).toContain("export type UserResource = ReturnType<typeof userAri>;");
    expect(code).not.toMatch(/from\s+["']@xndrjs\/naviql\/compile["']/);
  });
});
