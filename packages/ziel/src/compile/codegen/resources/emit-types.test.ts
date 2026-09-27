import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  arrayOf,
  defScalar,
  field,
  objectType,
  pageDetailProgram,
  prim,
  resource,
  resourceRef,
  scalarRef,
  span,
  strLit,
  typeProj,
  union,
} from "../../../fixtures";
import type { Program, TypeExpr } from "../../../ir";
import { parseAndCheck } from "../../parse-and-check";
import { emitPayloadTypes, printTypeExpr } from "./emit-types";
import { generateResources } from "../generators/generate-resources";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function normalizeWhitespace(code: string): string {
  return code.trim().replace(/\n{3,}/g, "\n\n");
}

function nullable(of: TypeExpr): TypeExpr {
  return { kind: "nullable", of, span };
}

describe("printTypeExpr", () => {
  it("maps primitives, scalars, literals, nullable, array, union", () => {
    expect(printTypeExpr(prim("string"))).toBe("string");
    expect(printTypeExpr(scalarRef("PostId"))).toBe("PostId");
    expect(printTypeExpr(strLit("Hero"))).toBe('"Hero"');
    expect(printTypeExpr(nullable(prim("string")))).toBe("string | null");
    expect(printTypeExpr(arrayOf(prim("number")))).toBe("number[]");
    expect(printTypeExpr(union(strLit("a"), strLit("b")))).toBe('"a" | "b"');
    expect(printTypeExpr(resourceRef("Tab"))).toBe("TabPayload");
  });

  it("parenthesizes union / nullable inside arrays", () => {
    expect(printTypeExpr(arrayOf(union(strLit("a"), strLit("b"))))).toBe('("a" | "b")[]');
    expect(printTypeExpr(arrayOf(nullable(prim("string"))))).toBe("(string | null)[]");
  });
});

describe("emitPayloadTypes", () => {
  it("returns empty string when there are no resources", () => {
    const program: Program = {
      scalars: [],
      resources: [],
      fragments: [],
      datasources: [],
      queries: [],
      span,
    };
    expect(emitPayloadTypes(program)).toBe("");
  });

  it("emits object payloads for Post + User from post-detail.ziel", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.ziel"),
      "file:///fixtures/post-detail.ziel"
    );
    expect(diagnostics).toEqual([]);

    expect(normalizeWhitespace(emitPayloadTypes(program))).toBe(
      normalizeWhitespace(`
export type PostPayload = {
  id: PostId;
  title: string;
  content: string;
  authorId: UserId;
};

export type UserPayload = {
  id: UserId;
  username: string;
};
`)
    );
  });

  it("emits resourceRef, unions, and Entry-link strip objects from page-detail", () => {
    const program = pageDetailProgram();
    const code = emitPayloadTypes(program);

    expect(code).toContain("export type EntryPayload = {");
    expect(code).toContain(`type: "Hero"`);
    expect(code).toContain(`type: "SiteInternalLink"`);
    expect(code).toContain(`type: "Page"`);
    expect(code).toContain(
      `export type CustomReferencePayload = {
  type: "Entry";
  spaceId: SpaceId;
  environmentId: EnvironmentId;
  id: EntryId;
} | {
  type: "Asset";
  spaceId: SpaceId;
  environmentId: EnvironmentId;
  id: AssetId;
};`
    );
    expect(code).toContain("tabs: {\n    id: EntryId;\n  }[];");
    expect(code).toContain("targetId: EntryId;");
    expect(code).not.toContain("TabCollection");
    expect(code).not.toContain("EditorialModulePayload");
    expect(code).not.toContain("HeroPayload");
    expect(code).toContain(`type: "Tabs"`);
    expect(code).toContain(`type: "Product"`);
    expect(code).toContain("export type AssetPayload = {");
    expect(code).toContain(`kind: "image" | "video" | "document";`);
    expect(code).not.toContain("EditorialModule.type");
    expect(code).not.toContain("typeProjection");
  });

  it("emits Page strips as EntryId link objects", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("page-detail.ziel"),
      "file:///fixtures/page-detail.ziel"
    );
    expect(diagnostics).toEqual([]);

    const code = emitPayloadTypes(program);
    expect(code).toContain(`export type PagePayload = {
  id: EntryId;
  title: string;
  menuId: EntryId;
  footerId: EntryId;
  strips: {
    id: EntryId;
  }[];
  related: CustomReferenceValue[];
};`);
  });

  it("throws on unresolved typeProjection when the target resource is missing", () => {
    const program: Program = {
      scalars: [defScalar("Id", "string")],
      resources: [
        resource(
          "Broken",
          [field("id", scalarRef("Id"))],
          objectType(field("kind", typeProj("Missing", "type")))
        ),
      ],
      fragments: [],
      datasources: [],
      queries: [],
      span,
    };

    expect(() => emitPayloadTypes(program)).toThrow(/failed to resolve/);
  });
});

describe("generateResources — payload types", () => {
  it("includes Post/User payloads for post-detail", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.ziel"),
      "file:///fixtures/post-detail.ziel"
    );
    expect(diagnostics).toEqual([]);

    const { code } = generateResources(program);
    expect(code).toContain("export type PostPayload = {");
    expect(code).toContain("export type UserPayload = {");
    expect(code).toContain("authorId: UserId;");
  });
});
