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
  payloadIntersectionFields,
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
    expect(normalizeIncludeMode("includenone")).toBe("none");
    expect(normalizeIncludeMode("include all")).toBe("all");
    expect(normalizeIncludeMode("include properties")).toBe("properties");
    expect(normalizeIncludeMode("include none")).toBe("none");
    expect(normalizeIncludeMode("none")).toBe("none");
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

  it("payloadIntersectionFields unions discriminant literals across members", () => {
    const fields = payloadIntersectionFields(entry.payloadType, resources);
    expect(fields.map((f) => f.name)).toEqual(["type", "id", "title"]);
    const typeField = fields.find((f) => f.name === "type")!;
    expect(typeField.type).toEqual({
      kind: "union",
      members: [
        { kind: "stringLiteral", value: "Hero", span: null },
        { kind: "stringLiteral", value: "Page", span: null },
      ],
      span: null,
    });
  });

  it("include all unions explicit fields and drops expand aliases", () => {
    expect(
      resolveSelectedFields(
        ["title"],
        [
          {
            alias: "strips",
            target: null,
            multiplicity: "many",
            comprehension: null,
            onFailure: "throw",
            span: null,
          },
        ],
        "all",
        page.payloadType,
        resources
      )
    ).toEqual(["id", "title", "menuId"]);
  });

  it("include properties drops refers fields; expand shadows strips", () => {
    expect(
      resolveSelectedFields(
        [],
        [
          {
            alias: "strips",
            target: null,
            multiplicity: "many",
            comprehension: null,
            onFailure: "throw",
            span: null,
          },
        ],
        "properties",
        page.payloadType,
        resources
      )
    ).toEqual(["id", "title"]);
  });

  it("include none keeps only explicit fields (empty auto-include)", () => {
    expect(resolveSelectedFields(["title"], [], "none", page.payloadType, resources)).toEqual([
      "title",
    ]);
    expect(resolveSelectedFields([], [], "none", page.payloadType, resources)).toEqual([]);
  });

  it("resolves include against a narrowed arm payload, not the union intersection", () => {
    const hero = objectType(
      field("type", strLit("Hero")),
      field("id", scalarRef("Id"), true),
      field("title", prim("string")),
      field("headline", prim("string")),
      field("imageId", scalarRef("Id"), false, [{ resource: "Page", fields: [], span: null }])
    );
    expect(payloadSelectableFields(entry.payloadType, resources).map((f) => f.name)).toEqual([
      "type",
      "id",
      "title",
    ]);
    expect(resolveSelectedFields([], [], "properties", hero, resources)).toEqual([
      "type",
      "id",
      "title",
      "headline",
    ]);
    expect(
      resolveSelectedFields(
        [],
        [
          {
            alias: "image",
            target: null,
            multiplicity: "one",
            comprehension: null,
            onFailure: "throw",
            span: null,
          },
        ],
        "all",
        hero,
        resources
      )
    ).toEqual(["type", "id", "title", "headline", "imageId"]);
  });

  it("exclude subtracts from include all / properties", () => {
    expect(
      resolveSelectedFields([], [], "all", page.payloadType, resources, ["menuId", "strips"])
    ).toEqual(["id", "title"]);
    expect(
      resolveSelectedFields([], [], "properties", page.payloadType, resources, ["title"])
    ).toEqual(["id"]);
  });

  it("exclude applies after expand-alias shadowing", () => {
    expect(
      resolveSelectedFields(
        [],
        [
          {
            alias: "strips",
            target: null,
            multiplicity: "many",
            comprehension: null,
            onFailure: "throw",
            span: null,
          },
        ],
        "all",
        page.payloadType,
        resources,
        ["menuId"]
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
        context { }
        root Page(id: id)
        on Page p include properties {
          expand strips: each link in p.strips (
            Entry(id: link.id)
          )
        }
        on Entry e include all {
          when e.type == "Hero" { }
          when e.type == "Page" { }
          default { }
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
        context { }
        root Page(id: id)
        on Page p include properties {
          expand strips: each link in p.strips (
            Entry(id: link.id)
          )
        }
        on Entry e {
          when e.type == "Hero" { id title }
          when e.type == "Page" { id title }
          default { }
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

  it("include properties on a when-arm uses the narrowed payload (not union intersection)", () => {
    const { program, diagnostics } = parseAndCheck(`
      scalar Id on string;
      resource Entry(id: Id):
        { type: "Hero", id, title: string, headline: string, imageId: Id refers Entry }
        | { type: "Page", id, title: string }
      query Q(id: Id) {
        context { }
        root Entry(id: id)
        on Entry e {
          when e.type == "Hero" include properties {
            expand image: Entry(id: e.imageId)
          }
          when e.type == "Page" include properties { }
          default { }
        }
      }
    `);
    expect(diagnostics).toEqual([]);
    const types = emitProjectionTypes(program!);
    expect(types).toContain("headline: string;");
    expect(types).toContain("image: Q_Entry_Hero | Q_Entry_Page;");
    expect(types).not.toContain("imageId:");
    const code = emitProjections(program!);
    expect(code).toContain("shell.headline = payload.headline;");
    expect(code).toContain("shell.image =");
    expect(code).not.toContain("shell.imageId");
  });

  it("arm include overrides clause include; absent arm inherits clause", () => {
    const { program, diagnostics } = parseAndCheck(`
      scalar Id on string;
      resource Entry(id: Id):
        { type: "Hero", id, title: string, imageId: Id refers Entry }
        | { type: "Page", id, title: string }
      query Q(id: Id) {
        context { }
        root Entry(id: id)
        on Entry e include all {
          when e.type == "Hero" include properties { }
          when e.type == "Page" { }
          default include none { }
        }
      }
    `);
    expect(diagnostics).toEqual([]);
    const types = emitProjectionTypes(program!);
    // Hero arm: properties → no imageId
    expect(types).toMatch(/export type Q_Entry_Hero = \{[^}]*title: string;[^}]*\};/s);
    expect(types).not.toMatch(/export type Q_Entry_Hero = \{[^}]*imageId:/s);
    // Page arm: inherits clause `all` — still only Page properties (no refers on Page)
    expect(types).toContain("export type Q_Entry_Page");
    const code = emitProjections(program!);
    expect(code).toContain('if (payload.type == "Hero") {');
    expect(code).not.toContain("shell.imageId");
    expect(code).toContain("shell.title = payload.title;");
  });

  it("default inherits clause include properties via union intersection fields", () => {
    const { program, diagnostics } = parseAndCheck(`
      scalar Id on string;
      resource Entry(id: Id):
        { kind: "Hero", id, title: string, headline: string }
        | { kind: "Page", id, title: string }
      query Q(id: Id) {
        context { }
        root Entry(id: id)
        on Entry e include properties {
          when e.kind == "Hero" { }
          when e.kind == "Page" { }
          default { }
        }
      }
    `);
    expect(diagnostics).toEqual([]);
    const types = emitProjectionTypes(program!);
    expect(types).toMatch(/export type Q_Entry_Default = \{[^}]*kind: "Hero" \| "Page";[^}]*\};/s);
    expect(types).toMatch(/export type Q_Entry_Default = \{[^}]*\bid:/s);
    expect(types).toMatch(/export type Q_Entry_Default = \{[^}]*title: string;[^}]*\};/s);
    expect(types).not.toMatch(/export type Q_Entry_Default = \{[^}]*headline:/s);
    const code = emitProjections(program!);
    expect(code).toContain("shell.kind = payload.kind;");
    expect(code).toContain("shell.id = payload.id;");
    expect(code).toContain("shell.title = payload.title;");
  });

  it("arm include none overrides clause include properties (explicit fields only)", () => {
    const { program, diagnostics } = parseAndCheck(`
      scalar Id on string;
      resource Entry(id: Id):
        { type: "Hero", id, title: string, headline: string }
        | { type: "Page", id, title: string }
      query Q(id: Id) {
        context { }
        root Entry(id: id)
        on Entry e include properties {
          when e.type == "Hero" include none { title }
          when e.type == "Page" { }
          default include none { }
        }
      }
    `);
    expect(diagnostics).toEqual([]);
    const hero = program!.queries[0]!.projections[0]!.arms![0]!;
    expect(hero.include).toBe("none");
    const types = emitProjectionTypes(program!);
    // Hero: include none + title → only title (no id / headline from properties)
    expect(types).toMatch(/export type Q_Entry_Hero = \{[^}]*title: string;[^}]*\};/s);
    expect(types).not.toMatch(/export type Q_Entry_Hero = \{[^}]*\bid:/s);
    expect(types).not.toMatch(/export type Q_Entry_Hero = \{[^}]*headline:/s);
    // Page: inherits clause properties → id + title
    expect(types).toMatch(/export type Q_Entry_Page = \{[^}]*id:/s);
    expect(types).toMatch(/export type Q_Entry_Page = \{[^}]*title: string;[^}]*\};/s);
    const code = emitProjections(program!);
    expect(code).toContain('if (payload.type == "Hero") {');
    expect(code).toContain("shell.title = payload.title;");
    expect(code).not.toContain("shell.headline");
  });

  it("on-clause include all codegen (fragments do not carry include)", () => {
    const { program, diagnostics } = parseAndCheck(`
      scalar Id on string;
      resource Page(id: Id): {
        id
        title: string
        menuId: Id refers Page
        strips: { id: Id }[]
      }
      fragment PageTitle on Page p { title }
      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p include all { ...PageTitle }
      }
    `);

    expect(diagnostics).toEqual([]);
    const types = emitProjectionTypes(program!);
    expect(types).toMatch(
      /export type Q_Page = \{[^}]*id: Id;[^}]*title: string;[^}]*menuId: Id;[^}]*strips:/s
    );
    const code = emitProjections(program!);
    expect(code).toContain("shell.id = payload.id;");
    expect(code).toContain("shell.title = payload.title;");
    expect(code).toContain("shell.menuId = payload.menuId;");
    expect(code).toContain("shell.strips = payload.strips;");
  });

  it("on-clause include none with explicit fragment fields", () => {
    const { program, diagnostics } = parseAndCheck(`
      scalar Id on string;
      resource Page(id: Id): {
        id
        title: string
        menuId: Id refers Page
        strips: { id: Id }[]
      }
      fragment PageTitle on Page p { title }
      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p include none { ...PageTitle }
      }
    `);

    expect(diagnostics).toEqual([]);
    const types = emitProjectionTypes(program!);
    expect(types).toMatch(/export type Q_Page = \{[^}]*title: string;[^}]*\};/s);
    expect(types).not.toMatch(/export type Q_Page = \{[^}]*\bid:/s);
    expect(types).not.toMatch(/export type Q_Page = \{[^}]*menuId:/s);

    const code = emitProjections(program!);
    expect(code).toContain("shell.title = payload.title;");
    expect(code).not.toContain("shell.id =");
    expect(code).not.toContain("shell.menuId");
    expect(code).not.toContain("shell.strips");
  });

  it("exclude from include all omits field in types and shell assign", () => {
    const { program, diagnostics } = parseAndCheck(`
      ${prelude}
      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p include all {
          exclude menuId
        }
        on Entry e {
          when e.type == "Hero" { id title }
          when e.type == "Page" { id title }
          default { }
        }
      }
    `);
    expect(diagnostics).toEqual([]);
    expect(program!.queries[0]!.projections[0]!.excludedFields).toEqual(["menuId"]);
    const types = emitProjectionTypes(program!);
    expect(types).toContain("id: Id;");
    expect(types).toContain("title: string;");
    expect(types).toContain("strips:");
    expect(types).not.toContain("menuId:");
    const code = emitProjections(program!);
    expect(code).toContain("shell.id = payload.id;");
    expect(code).not.toContain("shell.menuId");
  });

  it("does not swallow selected fields after exclude (exclude takes one name)", () => {
    const { program, diagnostics } = parseAndCheck(`
      ${prelude}
      query Q(id: Id) {
        context { }
        root Entry(id: id)
        on Entry e {
          when e.type == "Hero" {
            exclude title
            id
          }
          when e.type == "Page" { id title }
          default { }
        }
      }
    `);
    expect(diagnostics).toEqual([]);
    const arm = program!.queries[0]!.projections[0]!.arms![0]!;
    expect(arm.excludedFields).toEqual(["title"]);
    expect(arm.selectedFields).toEqual(["id"]);
  });

  it("rejects selected + excluded, unknown exclude, and exclude of expand alias", () => {
    const clash = parseAndCheck(`
      ${prelude}
      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p include all {
          title
          exclude title
        }
        on Entry e { id }
      }
    `);
    expect(clash.diagnostics).toContainEqual(
      expect.objectContaining({ code: "EXCLUDED_SELECTED_FIELD" })
    );

    const unknown = parseAndCheck(`
      ${prelude}
      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p include all {
          exclude nope
        }
        on Entry e { id }
      }
    `);
    expect(unknown.diagnostics).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_EXCLUDED_FIELD" })
    );

    const expandAlias = parseAndCheck(`
      ${prelude}
      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p include all {
          exclude strips
          expand strips: each link in p.strips (
            Entry(id: link.id)
          )
        }
        on Entry e { id }
      }
    `);
    expect(expandAlias.diagnostics).toContainEqual(
      expect.objectContaining({ code: "EXCLUDED_EXPAND_ALIAS" })
    );
  });

  it("fragment exclude of an explicit field is rejected (same as on clauses)", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}
      fragment PageTitleOnly on Page p {
        id
        title
        exclude id
      }
      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p include all { ...PageTitleOnly }
        on Entry e {
          when e.type == "Hero" { id title }
          when e.type == "Page" { id title }
          default { }
        }
      }
    `);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: "EXCLUDED_SELECTED_FIELD" })
    );
  });

  it("fixture page-detail still parseAndCheck clean", () => {
    const source = readFileSync(join(fixturesDir, "page-detail.ziel"), "utf8");
    const { diagnostics } = parseAndCheck(source, "file:///fixtures/page-detail.ziel");
    expect(diagnostics).toEqual([]);
  });
});
