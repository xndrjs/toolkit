import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseAndCheck } from "../compile/parse-and-check";
import { emitProjectionTypes } from "../compile/codegen/projections/emit-projection-types";
import { emitProjections } from "../compile/codegen/projections/emit-projections";
import { arrayOf, field, objectType, prim, resource, scalarRef, strLit, union } from "../fixtures";
import {
  normalizeIncludeMode,
  payloadSelectableFields,
  resolveSelectedFields,
} from "./projection-include";
import type { ResourceTable } from "./symbols";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function tableFromResources(...defs: ReturnType<typeof resource>[]): ResourceTable {
  return new Map(
    defs.map((r) => [
      r.name,
      {
        identity: new Map(r.identity.fields.map((f) => [f.name, f])),
        payload:
          r.payloadType.kind === "object"
            ? new Map(r.payloadType.fields.map((f) => [f.name, f]))
            : new Map(),
        payloadType: r.payloadType,
      },
    ])
  );
}

describe("normalizeIncludeMode", () => {
  it("maps Langium IncludeMode strings to IR", () => {
    expect(normalizeIncludeMode(undefined)).toBeNull();
    expect(normalizeIncludeMode("includeall")).toBe("all");
    expect(normalizeIncludeMode("includeproperties")).toBe("properties");
    expect(normalizeIncludeMode("include all")).toBe("all");
    expect(normalizeIncludeMode("include properties")).toBe("properties");
  });
});

describe("payloadSelectableFields / resolveSelectedFields", () => {
  const page = resource(
    "Page",
    [field("id", scalarRef("Id"))],
    objectType(
      field("id", scalarRef("Id"), true),
      field("title", prim("string")),
      field("menuId", scalarRef("Id"), false, [
        { resource: "Entry", fields: [{ name: "type", values: ["Menu"], span: null }], span: null },
      ]),
      field("strips", arrayOf(objectType(field("id", scalarRef("Id")))), false, [
        { resource: "Entry", fields: [], span: null },
      ])
    )
  );

  const entry = resource(
    "Entry",
    [field("id", scalarRef("Id"))],
    union(
      objectType(
        field("type", strLit("Hero")),
        field("id", scalarRef("Id"), true),
        field("title", prim("string"))
      ),
      objectType(
        field("type", strLit("Page")),
        field("id", scalarRef("Id"), true),
        field("title", prim("string"))
      )
    )
  );

  const resources = tableFromResources(page, entry);

  it("lists object fields and treats refers as relationships", () => {
    const fields = payloadSelectableFields(page.payloadType, resources);
    expect(fields.map((f) => f.name)).toEqual(["id", "title", "menuId", "strips"]);
    expect(fields.find((f) => f.name === "menuId")?.refers).not.toBeNull();
    expect(fields.find((f) => f.name === "title")?.refers).toBeNull();
  });

  it("intersects union members (same bar as UNKNOWN_SELECTED_FIELD)", () => {
    const fields = payloadSelectableFields(entry.payloadType, resources);
    expect(fields.map((f) => f.name)).toEqual(["type", "id", "title"]);
  });

  it("include all unions explicit fields and drops expand aliases", () => {
    expect(
      resolveSelectedFields(
        ["title"],
        [{ alias: "strips", target: null, multiplicity: "many", comprehension: null, span: null }],
        "all",
        "Page",
        resources
      )
    ).toEqual(["id", "title", "menuId"]);
  });

  it("include properties drops refers fields; expand shadows strips", () => {
    expect(
      resolveSelectedFields(
        [],
        [{ alias: "strips", target: null, multiplicity: "many", comprehension: null, span: null }],
        "properties",
        "Page",
        resources
      )
    ).toEqual(["id", "title"]);
  });
});

describe("include all / include properties — parseAndCheck + codegen", () => {
  const prelude = `
    scalar Id on string;
    resource Entry(id: Id):
      { type: "Hero", id, title: string }
      | { type: "Page", id, title: string }
    resource Page(id: Id): {
      id
      title: string
      menuId: Id refers Entry with { type: "Hero" }
      strips: { id: Id }[] refers Entry
    }
  `;

  it("lowers include flag and checks effective field sets", () => {
    const { program, diagnostics } = parseAndCheck(`
      ${prelude}
      query Q(id: Id) {
        root Page(id: id)
        on Page p include properties {
          expand strips: each link in p.strips (
            Entry(id: link.id)
          )
        }
        on Entry e include all {
          when e.type == "Hero" { }
          when e.type == "Page" { }
        }
      }
    `);
    expect(diagnostics).toEqual([]);
    const page = program!.queries[0]!.projections[0]!;
    expect(page.include).toBe("properties");
    expect(page.selectedFields).toEqual([]);
    const entry = program!.queries[0]!.projections[1]!;
    expect(entry.include).toBe("all");
  });

  it("emits property fields and expand-shadowed strips for include properties", () => {
    const { program, diagnostics } = parseAndCheck(`
      ${prelude}
      query Q(id: Id) {
        root Page(id: id)
        on Page p include properties {
          expand strips: each link in p.strips (
            Entry(id: link.id)
          )
        }
        on Entry e {
          when e.type == "Hero" { id title }
          when e.type == "Page" { id title }
        }
      }
    `);
    expect(diagnostics).toEqual([]);
    const types = emitProjectionTypes(program!);
    expect(types).toContain("id: Id;");
    expect(types).toContain("title: string;");
    expect(types).toContain("strips: Q_Entry[];");
    expect(types).not.toContain("menuId:");
    const code = emitProjections(program!);
    expect(code).toContain("shell.id = payload.id;");
    expect(code).toContain("shell.title = payload.title;");
    expect(code).toContain("shell.strips =");
    expect(code).not.toContain("shell.menuId");
  });

  it("fixture page-detail still parseAndCheck clean", () => {
    const source = readFileSync(join(fixturesDir, "page-detail.naviql"), "utf8");
    const { diagnostics } = parseAndCheck(source, "file:///fixtures/page-detail.naviql");
    expect(diagnostics).toEqual([]);
  });
});
