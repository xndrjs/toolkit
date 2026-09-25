import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { defScalar, field, objectType, resource, scalarRef, span } from "../../fixtures";
import type { Program } from "../../ir";
import { parseAndCheck } from "../parse-and-check";
import { emitRegistry } from "./emit-registry";
import { generateResources } from "./generate-resources";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function normalizeWhitespace(code: string): string {
  return code.trim().replace(/\n{3,}/g, "\n\n");
}

describe("emitRegistry", () => {
  it("returns empty string when there are no resources", () => {
    const program: Program = {
      scalars: [],
      resources: [],
      queries: [],
      span,
    };
    expect(emitRegistry(program, "ContentRegistry")).toBe("");
  });

  it("emits Post + User registry from post-detail.naviql", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.naviql"),
      "file:///fixtures/post-detail.naviql"
    );
    expect(diagnostics).toEqual([]);

    expect(normalizeWhitespace(emitRegistry(program, "ContentRegistry"))).toBe(
      normalizeWhitespace(`
export type ContentRegistry = {
  Post: PostPayload;
  User: UserPayload;
};
`)
    );
  });

  it("uses resource.ariType as keys and quotes non-identifiers", () => {
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
        resource("User", [field("id", scalarRef("PostId"))], objectType()),
      ],
      queries: [],
      span,
    };

    expect(normalizeWhitespace(emitRegistry(program, "ContentRegistry"))).toBe(
      normalizeWhitespace(`
export type ContentRegistry = {
  "cms.post": PostPayload;
  User: UserPayload;
};
`)
    );
  });

  it("respects registryTypeName option", () => {
    const program: Program = {
      scalars: [],
      resources: [resource("Tab", [field("id", scalarRef("PostId"))], objectType())],
      queries: [],
      span,
    };

    expect(emitRegistry(program, "PageRegistry")).toContain("export type PageRegistry = {");
  });
});

describe("generateResources — ContentRegistry", () => {
  it("includes ContentRegistry for post-detail and allows rename", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.naviql"),
      "file:///fixtures/post-detail.naviql"
    );
    expect(diagnostics).toEqual([]);

    const { code } = generateResources(program);
    expect(code).toContain("export type ContentRegistry = {");
    expect(code).toContain("Post: PostPayload;");
    expect(code).toContain("User: UserPayload;");

    const renamed = generateResources(program, { registryTypeName: "DemoRegistry" });
    expect(renamed.code).toContain("export type DemoRegistry = {");
    expect(renamed.code).not.toContain("export type ContentRegistry = {");
  });
});
