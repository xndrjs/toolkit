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
  singleRoot,
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

  it("rejects unknown binding inside an unused fragment body", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale): {
        type: "Hero"
        id
        imageId: AssetId
      }

      resource Asset(id: AssetId, locale: Locale): { id }

      fragment EntryBase on Entry e {
        expand image: Asset(
          id: c.imageId,
          locale: @c.locale
        )
      }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e { id }
      }
    `);

    expect(diagnostics.filter((d) => d.code === "UNKNOWN_BINDING")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNKNOWN_BINDING",
          message: expect.stringContaining("'c'"),
          path: expect.stringContaining("fragments.EntryBase"),
        }),
      ])
    );
  });

  it("accepts the fragment binding inside a fragment body", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale): {
        type: "Hero"
        id
        imageId: AssetId
      }

      resource Asset(id: AssetId, locale: Locale): { id }

      fragment EntryBase on Entry e {
        expand image: Asset(
          id: e.imageId,
          locale: @e.locale
        )
      }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e { id }
      }
    `);

    expect(diagnostics.filter((d) => d.code === "UNKNOWN_BINDING")).toEqual([]);
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

  it("rejects ...EntryLogo on Hero (when mismatch); accepts it on Menu", () => {
    const heroBad = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string, imageId: AssetId }
        | { type: "Menu", id, title: string, logoId: AssetId }
        | { type: "Page", id }

      resource Asset(id: AssetId, locale: Locale): { id }

      fragment EntryLogo on Entry e when e.type == "Menu" {
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
        code: "FRAGMENT_WHEN_MISMATCH",
        message: expect.stringContaining("EntryLogo"),
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

      fragment EntryLogo on Entry e when e.type == "Menu" {
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

  it("accepts Menu-only fields on fragment when; rejects them without when", () => {
    const withWhen = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string, imageId: AssetId }
        | { type: "Menu", id, title: string, logoId: AssetId }

      resource Asset(id: AssetId, locale: Locale): { id }

      fragment MenuOnly on Entry e when e.type == "Menu" {
        logoId
        expand logo: Asset(id: e.logoId, locale: context.locale)
      }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Hero" { type id }
          when e.type == "Menu" { type id ...MenuOnly }
        }
        on Asset a { id }
      }
    `);
    expect(withWhen.diagnostics).toEqual([]);

    const withoutWhen = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string, imageId: AssetId }
        | { type: "Menu", id, title: string, logoId: AssetId }

      resource Asset(id: AssetId, locale: Locale): { id }

      fragment MenuOnly on Entry e {
        logoId
      }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Hero" { type id }
          when e.type == "Menu" { type id }
        }
      }
    `);
    expect(withoutWhen.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_SELECTED_FIELD",
        message: expect.stringContaining("logoId"),
        path: expect.stringContaining("fragments.MenuOnly"),
      })
    );

    const wrongWhen = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string, imageId: AssetId }
        | { type: "Menu", id, title: string, logoId: AssetId }

      fragment MenuOnly on Entry e when e.type == "Hero" {
        logoId
      }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Hero" { type id }
          when e.type == "Menu" { type id }
        }
      }
    `);
    expect(wrongWhen.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_SELECTED_FIELD",
        message: expect.stringContaining("logoId"),
        path: expect.stringContaining("fragments.MenuOnly"),
      })
    );
  });

  it("applies include modes on fragments like on clauses", () => {
    const { diagnostics, program } = parseAndCheck(`
      scalar Id on string;
      resource Page(id: Id): { id title: string strips: { id: Id }[] }

      fragment PageProps on Page p include properties { }
      fragment PageNone on Page p include none { title }
      fragment PageAll on Page p include all { }

      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p { id }
      }
    `);

    expect(diagnostics).toEqual([]);
    expect(program.fragments.map((f) => ({ name: f.name, include: f.include }))).toEqual([
      { name: "PageProps", include: "properties" },
      { name: "PageNone", include: "none" },
      { name: "PageAll", include: "all" },
    ]);
  });

  it("spread of fragment include all matches on R include all field set", () => {
    const viaFragment = parseAndCheck(`
      scalar Id on string;
      resource Page(id: Id): {
        id
        title: string
        menuId: Id refers Page
        strips: { id: Id }[]
      }

      fragment PageAll on Page p include all { }

      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p { ...PageAll }
      }
    `);
    const viaOn = parseAndCheck(`
      scalar Id on string;
      resource Page(id: Id): {
        id
        title: string
        menuId: Id refers Page
        strips: { id: Id }[]
      }

      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p include all { }
      }
    `);

    expect(viaFragment.diagnostics).toEqual([]);
    expect(viaOn.diagnostics).toEqual([]);

    // Spread bakes include into selectedFields; on-clause keeps include on IR.
    expect(viaFragment.program.queries[0]!.projections[0]!.selectedFields).toEqual([
      "id",
      "title",
      "menuId",
      "strips",
    ]);
    expect(viaOn.program.queries[0]!.projections[0]!.include).toBe("all");
    expect(viaOn.program.queries[0]!.projections[0]!.selectedFields).toEqual([]);
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

describe("checkProgram — resolve to", () => {
  const resolveSource = `
    scalar SpaceId on string;
    scalar EnvironmentId on string;
    scalar Locale on string;
    scalar Ref on string;

    resource Entry(spaceId: SpaceId, environmentId: EnvironmentId, id: string, locale: Locale): {
      id
    }
    resource Asset(spaceId: SpaceId, environmentId: EnvironmentId, id: string, locale: Locale): {
      id
    }
    resource CustomReference(ref: Ref, locale: Locale): {
      type: "Entry" | "Asset"
      spaceId: SpaceId
      environmentId: EnvironmentId
      id: string
      locale: Locale
    }

    query Q(ref: Ref) {
      context { locale: Locale }
      root CustomReference(ref: ref, locale: context.locale)
      on CustomReference c resolve to {
        Entry(
          spaceId: c.spaceId,
          environmentId: c.environmentId,
          id: c.id,
          locale: c.locale
        ) when c.type == "Entry"
        Asset(
          spaceId: c.spaceId,
          environmentId: c.environmentId,
          id: c.id,
          locale: c.locale
        ) when c.type == "Asset"
      }
      on Entry e { id }
      on Asset a { id }
    }
  `;

  it("typechecks resolve-only on clauses against decode payload fields", () => {
    const { diagnostics, program } = parseAndCheck(resolveSource);
    expect(diagnostics).toEqual([]);
    expect(program.queries[0]!.projections[0]!.resolveArms).toHaveLength(2);
    expect(program.queries[0]!.projections[0]!.selectedFields).toEqual([]);
  });

  it("rejects hand-built IR that mixes resolveArms with a projection body", () => {
    const { diagnostics, program } = parseAndCheck(resolveSource);
    expect(diagnostics).toEqual([]);

    const projection = program.queries[0]!.projections[0]!;
    projection.selectedFields = ["id"];

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "MIXED_RESOLVE_PROJECTION" })
    );
  });

  it("rejects hand-built IR that mixes resolveArms with when-arms", () => {
    const { diagnostics, program } = parseAndCheck(resolveSource);
    expect(diagnostics).toEqual([]);

    const projection = program.queries[0]!.projections[0]!;
    projection.arms = [
      {
        when: { kind: "binary", op: "==", left: payload("c", "type"), right: lit("Entry"), span },
        selectedFields: ["id"],
        expansions: [],
        include: null,
        span,
      },
    ];

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "MIXED_RESOLVE_PROJECTION" })
    );
  });

  it("reuses construction checks for unknown resolve targets", () => {
    const { diagnostics, program } = parseAndCheck(resolveSource);
    expect(diagnostics).toEqual([]);

    program.queries[0]!.projections[0]!.resolveArms![0]!.target.resource = "Missing";

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_RESOURCE",
        message: expect.stringContaining("Missing"),
      })
    );
  });

  it("rejects resolve when-clauses that are not boolean", () => {
    const { diagnostics, program } = parseAndCheck(resolveSource);
    expect(diagnostics).toEqual([]);

    program.queries[0]!.projections[0]!.resolveArms![0]!.when = lit("Entry");

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({
        code: "RESOLVE_WHEN",
        message: expect.stringContaining("boolean"),
      })
    );
  });

  it("typechecks resolve when-arms with payload narrowing on closed disc unions", () => {
    const { diagnostics } = parseAndCheck(`
      scalar SpaceId on string;
      scalar Locale on string;
      scalar Ref on string;

      resource Entry(spaceId: SpaceId, id: string, locale: Locale): { id }
      resource Asset(spaceId: SpaceId, id: string, locale: Locale): { id }
      resource Locator(ref: Ref, locale: Locale):
        { type: "Entry", spaceId: SpaceId, id: string, locale: Locale }
        | { type: "Asset", spaceId: SpaceId, id: string, locale: Locale }

      query Q(ref: Ref) {
        context { locale: Locale }
        root Locator(ref: ref, locale: context.locale)
        on Locator c resolve to {
          Entry(spaceId: c.spaceId, id: c.id, locale: c.locale) when c.type == "Entry"
          Asset(spaceId: c.spaceId, id: c.id, locale: c.locale) when c.type == "Asset"
        }
        on Entry e { id }
        on Asset a { id }
      }
    `);

    expect(diagnostics).toEqual([]);
  });

  it("errors when resolve when-arms omit a closed discriminant", () => {
    const { diagnostics } = parseAndCheck(`
      scalar SpaceId on string;
      scalar Locale on string;
      scalar Ref on string;

      resource Entry(spaceId: SpaceId, id: string, locale: Locale): { id }
      resource Asset(spaceId: SpaceId, id: string, locale: Locale): { id }
      resource Locator(ref: Ref, locale: Locale):
        { type: "Entry", spaceId: SpaceId, id: string, locale: Locale }
        | { type: "Asset", spaceId: SpaceId, id: string, locale: Locale }

      query Q(ref: Ref) {
        context { locale: Locale }
        root Locator(ref: ref, locale: context.locale)
        on Locator c resolve to {
          Entry(spaceId: c.spaceId, id: c.id, locale: c.locale) when c.type == "Entry"
        }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "INEXHAUSTIVE_RESOLVE_ARMS",
        message: expect.stringContaining('"Asset"'),
      })
    );
  });
});

describe("checkProgram — missing on projection", () => {
  it("errors when an object expand has no projectable on Asset", () => {
    const program = withMutatedPageDetail((p) => {
      pageQuery(p).projections = pageQuery(p).projections.filter((pr) => pr.resource !== "Asset");
    });

    const missing = checkProgram(program).filter((d) => d.code === "MISSING_ON_PROJECTION");
    expect(missing).toContainEqual(
      expect.objectContaining({
        code: "MISSING_ON_PROJECTION",
        message: expect.stringContaining("Asset"),
        path: "queries.PageDetail",
        span: pageQuery(program).span,
        data: { missingResource: "Asset" },
      })
    );
  });

  it("errors when a collection expand has no on for the element resource", () => {
    const { diagnostics } = parseAndCheck(`
      scalar TabId on string;
      scalar TabsId on string;
      scalar Locale on string;

      resource Tab(id: TabId, locale: Locale): {
        id
      }

      resource TabCollection(tabsId: TabsId, locale: Locale): Tab[]

      resource Page(id: string, locale: Locale): {
        id
        tabsId: TabsId
      }

      query Q(pageId: string) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand tabs: TabCollection(tabsId: p.tabsId, locale: context.locale)
        }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MISSING_ON_PROJECTION",
        message: expect.stringContaining("Tab"),
        path: "queries.Q",
        data: { missingResource: "Tab" },
      })
    );
    const tabDiag = diagnostics.find(
      (d) => d.code === "MISSING_ON_PROJECTION" && d.data?.missingResource === "Tab"
    );
    expect(tabDiag?.span).not.toBeNull();
    expect(tabDiag?.path).toBe("queries.Q");
  });

  it("errors when a resolve-strip member lacks a projectable on", () => {
    const { diagnostics } = parseAndCheck(`
      scalar SpaceId on string;
      scalar Locale on string;
      scalar Ref on string;

      resource Entry(spaceId: SpaceId, id: string, locale: Locale): { id }
      resource Asset(spaceId: SpaceId, id: string, locale: Locale): { id }
      resource CustomReference(ref: Ref, locale: Locale): {
        type: "Entry" | "Asset"
        spaceId: SpaceId
        id: string
        locale: Locale
      }

      query Q(ref: Ref) {
        context { locale: Locale }
        root CustomReference(ref: ref, locale: context.locale)
        on CustomReference c resolve to {
          Entry(spaceId: c.spaceId, id: c.id, locale: c.locale) when c.type == "Entry"
          Asset(spaceId: c.spaceId, id: c.id, locale: c.locale) when c.type == "Asset"
        }
        on Entry e { id }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MISSING_ON_PROJECTION",
        message: expect.stringContaining("Asset"),
        path: "queries.Q",
        data: { missingResource: "Asset" },
      })
    );
    expect(diagnostics.filter((d) => d.code === "MISSING_ON_PROJECTION")).toHaveLength(1);
  });

  it("does not treat resolve-only on CustomReference as satisfying Entry / Asset", () => {
    const { diagnostics } = parseAndCheck(`
      scalar SpaceId on string;
      scalar Locale on string;
      scalar Ref on string;

      resource Entry(spaceId: SpaceId, id: string, locale: Locale): { id }
      resource Asset(spaceId: SpaceId, id: string, locale: Locale): { id }
      resource CustomReference(ref: Ref, locale: Locale): {
        type: "Entry" | "Asset"
        spaceId: SpaceId
        id: string
        locale: Locale
      }

      query Q(ref: Ref) {
        context { locale: Locale }
        root CustomReference(ref: ref, locale: context.locale)
        on CustomReference c resolve to {
          Entry(spaceId: c.spaceId, id: c.id, locale: c.locale) when c.type == "Entry"
          Asset(spaceId: c.spaceId, id: c.id, locale: c.locale) when c.type == "Asset"
        }
      }
    `);

    const missing = diagnostics.filter((d) => d.code === "MISSING_ON_PROJECTION");
    expect(missing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ data: { missingResource: "Entry" } }),
        expect.objectContaining({ data: { missingResource: "Asset" } }),
      ])
    );
    expect(missing).toHaveLength(2);
  });

  it("accepts a present on Asset for an object expand", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Locale on string;
      scalar EntryId on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale): {
        type: "Hero"
        id
        imageId: AssetId
      }

      resource Asset(id: AssetId, locale: Locale): {
        id
        url: string
      }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          id
          expand image: Asset(id: e.imageId, locale: context.locale)
        }
        on Asset a { id url }
      }
    `);

    expect(diagnostics.filter((d) => d.code === "MISSING_ON_PROJECTION")).toEqual([]);
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
      pageQuery(p).roots[0]!.construction.args = [arg("id", param("pageId"))];
    });

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "MISSING_CONSTRUCTOR_ARG" })
    );
  });

  it("rejects unknown constructor arg", () => {
    const program = withMutatedPageDetail((p) => {
      pageQuery(p).roots[0]!.construction.args.push(arg("extra", lit("x")));
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
      pageQuery(p).roots[0]!.construction.resource = "MissingRoot";
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
      fragments: [],
      datasources: [],
      queries: [
        query("Q", {
          parameters: [],
          context: [],
          roots: singleRoot(construct("Page", [arg("id", lit("x"))])),
          projections: [],
        }),
      ],
    };

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "SCALAR_RESOURCE_NAME_CLASH" })
    );
  });
});

describe("checkProgram — multi-root queries", () => {
  it("rejects duplicate root aliases", () => {
    const program: Program = {
      span,
      scalars: [defScalar("Id", "string")],
      resources: [
        resource(
          "R",
          [field("id", scalarRef("Id"))],
          objectType(field("id", scalarRef("Id"), true))
        ),
      ],
      fragments: [],
      datasources: [],
      queries: [
        query("Homepage", {
          parameters: [field("id", scalarRef("Id"))],
          context: [],
          roots: [
            { alias: "page", construction: construct("R", [arg("id", param("id"))]), span },
            { alias: "page", construction: construct("R", [arg("id", param("id"))]), span },
          ],
          projections: [],
        }),
      ],
    };

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_ROOT_ALIAS" })
    );
  });

  it("rejects bad construction args on a multi-root entry", () => {
    const program: Program = {
      span,
      scalars: [defScalar("Id", "string")],
      resources: [
        resource(
          "R",
          [field("id", scalarRef("Id"))],
          objectType(field("id", scalarRef("Id"), true))
        ),
      ],
      fragments: [],
      datasources: [],
      queries: [
        query("Homepage", {
          parameters: [field("id", scalarRef("Id"))],
          context: [],
          roots: [
            {
              alias: "page",
              construction: construct("R", [arg("id", param("id"))]),
              span,
            },
            {
              alias: "session",
              construction: construct("R", [arg("extra", param("id"))]),
              span,
            },
          ],
          projections: [],
        }),
      ],
    };

    const codes = checkProgram(program).map((d) => d.code);
    expect(codes).toContain("UNKNOWN_CONSTRUCTOR_ARG");
    expect(codes).toContain("MISSING_CONSTRUCTOR_ARG");
  });

  it("rejects empty roots on hand-built IR", () => {
    const program: Program = {
      span,
      scalars: [defScalar("Id", "string")],
      resources: [
        resource(
          "R",
          [field("id", scalarRef("Id"))],
          objectType(field("id", scalarRef("Id"), true))
        ),
      ],
      fragments: [],
      datasources: [],
      queries: [
        query("Q", {
          parameters: [],
          context: [],
          roots: [],
          projections: [],
        }),
      ],
    };

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({ code: "EMPTY_ROOTS", path: "queries.Q" })
    );
  });

  it("errors when context block is omitted in source", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Id on string;
      resource Page(id: Id): { id }
      query Q(id: Id) {
        root Page(id: id)
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MISSING_CONTEXT",
        path: "queries.Q",
        message: expect.stringContaining("context"),
      })
    );
  });

  it("accepts an empty context { } block", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Id on string;
      resource Page(id: Id): { id }
      query Q(id: Id) {
        context { }
        root Page(id: id)
        on Page p { id }
      }
    `);

    expect(diagnostics.filter((d) => d.code === "MISSING_CONTEXT")).toEqual([]);
  });

  it("errors when root/roots are omitted in source", () => {
    const { diagnostics } = parseAndCheck(`
      scalar Id on string;
      resource Page(id: Id): { id }
      query Q(id: Id) {
        context { }
        on Page p { id }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "EMPTY_ROOTS",
        path: "queries.Q",
      })
    );
  });
});

describe("checkProgram — islands", () => {
  const islandsPrelude = `
    scalar EntryId on string;
    scalar Locale on string;

    resource Entry(id: EntryId, locale: Locale): {
      id
      type: string
    }

    resource Page(id: EntryId, locale: Locale): {
      id
    }
  `;

  it("typechecks Menu/Footer island when and unconditional on Page", () => {
    const { diagnostics } = parseAndCheck(`
      ${islandsPrelude}

      query Q(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p { id }
        on Entry e { id type }
        islands {
          on Entry e when e.type == "Menu" or e.type == "Footer"
          on Page
        }
      }
    `);

    expect(diagnostics).toEqual([]);
  });

  it("rejects unknown island resource", () => {
    const { diagnostics } = parseAndCheck(`
      ${islandsPrelude}

      query Q(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p { id }
        islands {
          on Missing
        }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNKNOWN_RESOURCE",
        message: expect.stringContaining("Missing"),
      })
    );
  });

  it("requires a binding when island when-clause is present", () => {
    const { diagnostics } = parseAndCheck(`
      ${islandsPrelude}

      query Q(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p { id }
        islands {
          on Entry when true
        }
      }
    `);

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: "ISLAND_BINDING_REQUIRED",
        message: expect.stringContaining("Entry"),
      })
    );
  });

  it("rejects non-boolean island when-clauses", () => {
    const { diagnostics, program } = parseAndCheck(`
      ${islandsPrelude}

      query Q(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p { id }
        on Entry e { id type }
        islands {
          on Entry e when e.type == "Menu"
        }
      }
    `);
    expect(diagnostics).toEqual([]);

    program.queries[0]!.islands[0]!.when = lit("Menu");

    expect(checkProgram(program)).toContainEqual(
      expect.objectContaining({
        code: "TYPE_MISMATCH",
        message: expect.stringContaining("boolean"),
      })
    );
  });
});

describe("checkProgram — expression ops in / not in / !", () => {
  const prelude = `
    scalar EntryId on string;
    scalar Locale on string;

    resource Entry(id: EntryId, locale: Locale):
      { type: "Menu" id visible: boolean }
      | { type: "Footer" id visible: boolean }
      | { type: "Hero" id visible: boolean }

    resource Page(id: EntryId, locale: Locale): { id }
  `;

  it("accepts in / not in / ! across projection, resolve, and islands", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      resource Ref(id: EntryId):
        { type: "Entry" id: EntryId }
        | { type: "Asset" id: EntryId }

      query Q(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p { id }
        on Entry e {
          when e.type in ["Menu", "Footer"] { id }
          when e.type not in ["Hero"] { id }
          when !e.visible { id }
        }
        on Ref r resolve to {
          Entry(id: r.id, locale: context.locale) when r.type == "Entry"
          Entry(id: r.id, locale: context.locale) when r.type not in ["Entry"]
        }
        islands {
          on Entry e when e.type in ["Menu", "Footer"] or !e.visible
        }
      }
    `);

    expect(diagnostics.filter((d) => d.code === "TYPE_MISMATCH")).toEqual([]);
  });

  it("treats type in […] as covering those discriminants for exhaustiveness", () => {
    const { diagnostics } = parseAndCheck(`
      ${prelude}

      query Q(pageId: EntryId) {
        context { locale: Locale }
        root Entry(id: pageId, locale: context.locale)
        on Entry e {
          when e.type in ["Menu", "Footer", "Hero"] { id }
        }
      }
    `);

    expect(diagnostics).toEqual([]);
  });
});
