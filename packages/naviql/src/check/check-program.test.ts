import { describe, expect, it } from "vitest";

import { checkProgram, type Program } from "../compile";
import { parseAndCheck } from "../compile/parse-and-check";

import {
  arg,
  construct,
  defScalar,
  expand,
  field,
  identity,
  lit,
  pageDetailProgram,
  param,
  payload,
  prim,
  projection,
  query,
  resource,
  objectType,
  scalarRef,
  span,
} from "../fixtures";

function cloneProgram(program: Program): Program {
  return JSON.parse(JSON.stringify(program)) as Program;
}

function withMutatedPageDetail(mutate: (program: Program) => void): Program {
  const program = cloneProgram(pageDetailProgram());
  mutate(program);
  return program;
}

function pageQuery(program: Program) {
  return program.queries.find((q) => q.name === "PageDetail")!;
}

function pageProjection(program: Program) {
  return pageQuery(program).projections.find((p) => p.binding === "p")!;
}

function menuExpand(program: Program) {
  return pageProjection(program).expansions.find((e) => e.alias === "menu")!;
}

describe("checkProgram — pageDetail happy path", () => {
  it("typechecks the Page / Entry when-arms / Asset graph", () => {
    expect(checkProgram(pageDetailProgram())).toEqual([]);
  });
});

describe("checkProgram — each-expand exhaustiveness", () => {
  it("errors when arms omit a closed type discriminant", () => {
    // Page-detail strips are open `{ id }[]` links (no discriminants). Use a
    // local closed object-union so INEXHAUSTIVE_EXPAND_ARMS still has coverage.
    const { diagnostics } = parseAndCheck(`
      scalar Locale on string;
      scalar PageId on string;
      scalar HeroId on string;
      scalar ProductId on string;

      resource Page(id: PageId, locale: Locale): {
        id
        strips: (
          { type: "Hero", id: HeroId } |
          { type: "Product", id: ProductId }
        )[]
      }

      resource Hero(id: HeroId, locale: Locale): {
        type: "Hero"
        id
      }

      resource Product(id: ProductId, locale: Locale): {
        type: "Product"
        id
      }

      query Q(pageId: PageId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand strips: each s in p.strips (
            Hero(id: s.id, locale: context.locale) when s.type == "Hero"
          )
        }
        on Hero h { id }
        on Product prod { id }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "INEXHAUSTIVE_EXPAND_ARMS",
        message: expect.stringContaining('"Product"'),
      })
    );
  });
});

describe("checkProgram — projection when-arms", () => {
  it("typechecks exhaustive on Entry when-arms with payload narrowing", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string, imageId: AssetId }
        | { type: "Page", id, title: string }

      resource Asset(id: AssetId, locale: Locale): {
        id
        url: string
      }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Hero" {
            id
            title
            expand image: Asset(id: e.imageId, locale: context.locale)
          }
          when e.type == "Page" {
            id
          }
        }
        on Asset a { id url }
      }
    `);

    expect(diagnostics).toEqual([]);
  });

  it("errors when projection when-arms omit a closed discriminant", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string }
        | { type: "Page", id, title: string }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Hero" {
            id
            title
          }
        }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "INEXHAUSTIVE_PROJECTION_ARMS",
        message: expect.stringContaining('"Page"'),
      })
    );
  });

  it("rejects hand-built IR that keeps root fields alongside when-arms", () => {
    const { diagnostics, program } = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id }
        | { type: "Page", id }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Hero" { id }
          when e.type == "Page" { id }
        }
      }
    `);
    expect(diagnostics).toEqual([]);

    const projection = program.queries[0]!.projections[0]!;
    projection.selectedFields = ["id"];

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "MIXED_PROJECTION_BODY" })
    );
  });

  it("allows on-level preamble + when (desugared; no MIXED_PROJECTION_BODY)", () => {
    const { diagnostics, program } = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;

      fragment EntryBase on Entry e { type id }

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id }
        | { type: "Page", id }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          ...EntryBase
          when e.type == "Hero" { }
          when e.type == "Page" { }
        }
      }
    `);

    expect(diagnostics).toEqual([]);
    expect(diagnostics.every((d) => d.code !== "MIXED_PROJECTION_BODY")).toBe(true);
    const entry = program.queries[0]!.projections[0]!;
    expect(entry.selectedFields).toEqual([]);
    expect(entry.expansions).toEqual([]);
    expect(entry.arms?.[0]?.selectedFields).toEqual(["type", "id"]);
    expect(entry.arms?.[1]?.selectedFields).toEqual(["type", "id"]);
  });

  it("rejects preamble field illegal on a narrowed arm", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string }
        | { type: "Page", id }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          title
          when e.type == "Hero" { id }
          when e.type == "Page" { id }
        }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_SELECTED_FIELD",
        message: expect.stringContaining("title"),
      })
    );
  });

  it("rejects ...EntryLogo on Hero (logoId absent); accepts it on Menu", () => {
    const heroBad = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string, imageId: AssetId }
        | { type: "Menu", id, title: string, logoId: AssetId }
        | { type: "Page", id }

      resource Asset(id: AssetId, locale: Locale): { id }

      fragment EntryLogo on Entry e {
        title
        expand logo: Asset(id: e.logoId, locale: context.locale)
      }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Hero" { ...EntryLogo }
          when e.type == "Menu" { type id }
          when e.type == "Page" { type id }
        }
        on Asset a { id }
      }
    `);

    expect(heroBad.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_PAYLOAD_PATH",
        message: expect.stringContaining("logoId"),
      })
    );

    const menuOk = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string, imageId: AssetId }
        | { type: "Menu", id, title: string, logoId: AssetId }
        | { type: "Page", id }

      resource Asset(id: AssetId, locale: Locale): { id }

      fragment EntryLogo on Entry e {
        title
        expand logo: Asset(id: e.logoId, locale: context.locale)
      }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Hero" { type id title }
          when e.type == "Menu" { type id ...EntryLogo }
          when e.type == "Page" { type id }
        }
        on Asset a { id }
      }
    `);

    expect(menuOk.diagnostics).toEqual([]);
  });

  it("rejects selecting a field absent from the narrowed arm", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string, imageId: AssetId }
        | { type: "Page", id, title: string }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Page" {
            id
            imageId
          }
          when e.type == "Hero" {
            id
          }
        }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_SELECTED_FIELD",
        message: expect.stringContaining("imageId"),
      })
    );
  });
});

describe("checkProgram — negative diagnostics", () => {
  it("rejects Entry(id: @p.locale) — Locale is not assignable to EntryId", () => {
    const program = withMutatedPageDetail((p) => {
      menuExpand(p).target!.args = [
        arg("spaceId", identity("p", "spaceId")),
        arg("environmentId", identity("p", "environmentId")),
        arg("id", identity("p", "locale")),
        arg("locale", identity("p", "locale")),
      ];
    });

    const diags = checkProgram(program);
    expect(diags).toContainEqual(
      expect.objectContaining({
        code: "TYPE_MISMATCH",
        message: expect.stringMatching(/Locale.*EntryId|EntryId.*Locale/),
      })
    );
  });

  it("rejects identity/payload semantic conflict on the same field name", () => {
    const program = withMutatedPageDetail((p) => {
      const asset = p.resources.find((r) => r.name === "Asset")!;
      expect(asset.payloadType.kind).toBe("object");
      if (asset.payloadType.kind !== "object") return;
      const idPayload = asset.payloadType.fields.find((f) => f.name === "id")!;
      idPayload.type = scalarRef("EntryId");
      idPayload.inheritedFromIdentity = false;
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "IDENTITY_PAYLOAD_TYPE_MISMATCH" })
    );
  });

  it("rejects payload shorthand without a matching identity field", () => {
    const program = withMutatedPageDetail((p) => {
      const page = p.resources.find((r) => r.name === "Page")!;
      expect(page.payloadType.kind).toBe("object");
      if (page.payloadType.kind !== "object") return;
      page.payloadType.fields.push(field("orphan", scalarRef("EntryId"), true));
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "SHORTHAND_NO_IDENTITY" })
    );
  });

  it("rejects unknown selected payload field", () => {
    const program = withMutatedPageDetail((p) => {
      pageProjection(p).selectedFields.push("notAField");
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_SELECTED_FIELD" })
    );
  });

  it("rejects identityRef path missing on the resource", () => {
    const program = withMutatedPageDetail((p) => {
      menuExpand(p).target!.args = [
        arg("spaceId", identity("p", "spaceId")),
        arg("environmentId", identity("p", "environmentId")),
        arg("id", identity("p", "missing")),
        arg("locale", identity("p", "locale")),
      ];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_IDENTITY_PATH" })
    );
  });

  it("rejects payloadRef to an identity-only field (locale)", () => {
    const program = withMutatedPageDetail((p) => {
      menuExpand(p).target!.args = [
        arg("spaceId", identity("p", "spaceId")),
        arg("environmentId", identity("p", "environmentId")),
        arg("id", payload("p", "menuId")),
        arg("locale", payload("p", "locale")),
      ];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_PAYLOAD_PATH" })
    );
  });

  it("rejects identityRef when binding is not in scope", () => {
    const program = withMutatedPageDetail((p) => {
      menuExpand(p).target!.args = [
        arg("spaceId", identity("p", "spaceId")),
        arg("environmentId", identity("p", "environmentId")),
        arg("id", identity("noSuchBinding", "id")),
        arg("locale", identity("p", "locale")),
      ];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_BINDING" })
    );
  });

  it("rejects missing constructor arg", () => {
    const program = withMutatedPageDetail((p) => {
      pageQuery(p).root.args = [arg("id", param("pageId"))];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "MISSING_CONSTRUCTOR_ARG" })
    );
  });

  it("rejects unknown constructor arg", () => {
    const program = withMutatedPageDetail((p) => {
      pageQuery(p).root.args.push(arg("extra", lit("x")));
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_CONSTRUCTOR_ARG" })
    );
  });

  it("rejects typed string where EntryId is expected (no primitive widening)", () => {
    const program = withMutatedPageDetail((p) => {
      pageQuery(p).parameters = [field("pageId", prim("string"))];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({
        code: "TYPE_MISMATCH",
        message: expect.stringContaining("string is not assignable to EntryId"),
      })
    );
  });

  it("rejects unknown scalar ref", () => {
    const program = withMutatedPageDetail((p) => {
      const page = p.resources.find((r) => r.name === "Page")!;
      expect(page.payloadType.kind).toBe("object");
      if (page.payloadType.kind !== "object") return;
      page.payloadType.fields.push(field("weird", scalarRef("NotAScalar")));
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_SCALAR" })
    );
  });

  it("rejects duplicate scalar name", () => {
    const program = withMutatedPageDetail((p) => {
      p.scalars.push(defScalar("EntryId", "string"));
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_SCALAR" })
    );
  });

  it("rejects unknown resource in root / expand / on", () => {
    const program = withMutatedPageDetail((p) => {
      pageQuery(p).root.resource = "MissingRoot";
      menuExpand(p).target!.resource = "MissingExpand";
      pageQuery(p).projections.push(projection("MissingOn", "x", ["id"]));
    });

    const codes = checkProgram(program).map((d) => d.code);
    expect(codes.filter((c) => c === "UNKNOWN_RESOURCE").length).toBeGreaterThanOrEqual(3);
  });

  it("rejects duplicate expansion alias within a projection", () => {
    const program = withMutatedPageDetail((p) => {
      const proj = pageProjection(p);
      proj.expansions.push(
        expand(
          "menu",
          construct("Entry", [
            arg("spaceId", identity("p", "spaceId")),
            arg("environmentId", identity("p", "environmentId")),
            arg("id", payload("p", "menuId")),
            arg("locale", identity("p", "locale")),
          ])
        )
      );
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_EXPANSION_ALIAS" })
    );
  });

  it("rejects constructor arg type mismatch (SpaceId into EntryId)", () => {
    const program = withMutatedPageDetail((p) => {
      menuExpand(p).target!.args = [
        arg("spaceId", identity("p", "spaceId")),
        arg("environmentId", identity("p", "environmentId")),
        arg("id", identity("p", "spaceId")),
        arg("locale", identity("p", "locale")),
      ];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({
        code: "TYPE_MISMATCH",
        message: expect.stringMatching(/SpaceId.*EntryId/),
      })
    );
  });
});

describe("checkProgram — scalar / resource name clash", () => {
  it("rejects scalar name that clashes with a resource", () => {
    const program: Program = {
      span,
      scalars: [defScalar("Page", "string")],
      resources: [
        resource(
          "Page",
          [field("id", scalarRef("Page"))],
          objectType(field("id", scalarRef("Page"), true))
        ),
      ],
      queries: [
        query("Q", {
          parameters: [],
          context: [],
          root: construct("Page", [arg("id", lit("x"))]),
          projections: [],
        }),
      ],
    };

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "SCALAR_RESOURCE_NAME_CLASH" })
    );
  });
});
