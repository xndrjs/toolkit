import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { pageDetailProgram } from "../../../fixtures";
import type { Program } from "../../../ir";
import { parseAndCheck } from "../../parse-and-check";
import { emitProjectionTypes, printExpansionAliasType } from "./emit-projection-types";
import {
  projectFnName,
  projectionTypeName,
  projectionVariantTypeName,
  queryResultTypeName,
} from "../naming";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function normalizeWhitespace(code: string): string {
  return code.trim().replace(/\n{3,}/g, "\n\n");
}

describe("projection naming", () => {
  it("maps query + resource to project*, Result, and scoped types", () => {
    expect(projectFnName("PostDetail")).toBe("projectPostDetail");
    expect(queryResultTypeName("PostDetail")).toBe("PostDetailResult");
    expect(projectionTypeName("PostDetail", "Post")).toBe("PostDetail_Post");
    expect(projectionTypeName("PageDetail", "Hero")).toBe("PageDetail_Hero");
    expect(projectionVariantTypeName("EntryDetail", "Entry", "Hero")).toBe(
      "EntryDetail_Entry_Hero"
    );
  });
});

describe("emitProjectionTypes", () => {
  it("returns empty string when there are no queries", () => {
    const program: Program = {
      scalars: [],
      resources: [],
      fragments: [],
      datasources: [],
      queries: [],
      span: null,
    };
    expect(emitProjectionTypes(program)).toBe("");
  });

  it("emits selected fields and restored aliases for post-detail", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.ziel"),
      "file:///fixtures/post-detail.ziel"
    );
    expect(diagnostics).toEqual([]);

    expect(normalizeWhitespace(emitProjectionTypes(program))).toBe(
      normalizeWhitespace(`
export type PostDetail_Post = {
  id: PostId;
  title: string;
  content: string;
  author: PostDetail_User;
};

export type PostDetail_User = {
  id: UserId;
  username: string;
};

export type PostDetailResult = PostDetail_Post;
`)
    );
  });

  it("stamps resourceTag when configured", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.ziel"),
      "file:///fixtures/post-detail.ziel"
    );
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program, "$type");
    expect(code).toContain(`$type: "Post";`);
    expect(code).toContain(`$type: "User";`);

    const alt = emitProjectionTypes(program, "__resource");
    expect(alt).toContain(`__resource: "Post";`);
    expect(alt).not.toContain("$type");
  });

  it("emits alias-keyed Result for multi-root queries", () => {
    const source = `
      scalar PageId on string;
      scalar SessionId on string;

      resource Page(id: PageId): { id title: string }
      resource UserSession(id: SessionId): { id userId: string }

      query Homepage(pageId: PageId, sessionId: SessionId) {
        context { }
        roots {
          page: Page(id: pageId)
          session: UserSession(id: sessionId)
        }
        on Page p { id title }
        on UserSession s { id userId }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    expect(normalizeWhitespace(emitProjectionTypes(program!))).toBe(
      normalizeWhitespace(`
export type Homepage_Page = {
  id: PageId;
  title: string;
};

export type Homepage_UserSession = {
  id: SessionId;
  userId: string;
};

export type HomepageResult = {
  page: Homepage_Page;
  session: Homepage_UserSession;
};
`)
    );
  });

  it("emits Entry variant shells + union alias for armed on Entry", () => {
    const source = `
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

      query EntryDetail(entryId: EntryId) {
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
          default { }
        }
        on Asset a { id url }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program!);

    expect(normalizeWhitespace(code)).toContain(
      normalizeWhitespace(`
export type EntryDetail_Entry_Hero = {
  id: EntryId;
  title: string;
  image: EntryDetail_Asset;
};

export type EntryDetail_Entry_Page = {
  id: EntryId;
};

export type EntryDetail_Entry_Default = {};

export type EntryDetail_Entry = EntryDetail_Entry_Hero | EntryDetail_Entry_Page | EntryDetail_Entry_Default;
`)
    );
    expect(code).toContain("export type EntryDetailResult = EntryDetail_Entry;");
    expect(code).not.toContain("EntryDetail_Hero");
  });

  it("emits union strip and Entry variant aliases for page-detail", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("page-detail.ziel"),
      "file:///fixtures/page-detail.ziel"
    );
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program);

    expect(code).not.toContain("$type");
    expect(code).toContain("strips: PageDetail_Entry[];");
    expect(code).toContain("related: (PageDetail_Entry | PageDetail_Asset)[];");
    expect(code).toContain("tabs: PageDetail_Entry[];");
    expect(code).toContain("menu: PageDetail_Entry_Menu;");
    expect(code).toContain("footer: PageDetail_Entry_Footer;");
    expect(code).toContain("image: PageDetail_Asset;");
    expect(code).toContain("export type PageDetail_Entry_Hero = {");
    expect(code).toContain("export type PageDetail_Entry_Default = {");
    expect(code).toContain("export type PageDetail_Entry =");
    expect(code).toContain("PageDetail_Entry_Default");
    expect(code).not.toContain("export type PageDetail_Entry_Page = {");
    expect(code).not.toContain("export type PageDetail_Entry_Product = {");
    expect(code).toContain(`kind: "image" | "video" | "document";`);
    expect(code).toContain("export type PageDetailResult = PageDetail_Page;");
    expect(code).not.toContain("PageDetail_EditorialModule");
    expect(code).not.toContain("TabCollection");
    expect(code).not.toContain("PageDetail_Hero");
    expect(code).not.toContain("PageDetail_CustomReference");
  });

  it("strips resolve-only CustomReference aliases to Entry | Asset (no CustomReference type)", () => {
    const source = `
      scalar SpaceId on string;
      scalar EnvironmentId on string;
      scalar Locale on string;
      scalar Ref on string;

      resource Entry(spaceId: SpaceId, environmentId: EnvironmentId, id: string, locale: Locale): {
        type: "Hero"
        id
        title: string
      }
      resource Asset(spaceId: SpaceId, environmentId: EnvironmentId, id: string, locale: Locale): {
        id
        url: string
      }
      resource CustomReference(ref: Ref, locale: Locale): {
        type: "Entry" | "Asset"
        spaceId: SpaceId
        environmentId: EnvironmentId
        id: string
        locale: Locale
      }
      resource Page(id: string, locale: Locale): {
        id
        related: Ref[]
      }

      query PageDetail(pageId: string) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand related: each ref in p.related (
            CustomReference(ref: ref, locale: @p.locale)
          )
        }
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
        on Entry e {
          when e.type == "Hero" {
            id
            title
          }
          default { }
        }
        on Asset a { id url }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program!);

    expect(code).toContain("related: (PageDetail_Entry | PageDetail_Asset)[];");
    expect(code).toContain("export type PageDetail_Entry_Hero = {");
    expect(code).toContain("export type PageDetail_Entry_Default = {");
    expect(code).toContain(
      "export type PageDetail_Entry = PageDetail_Entry_Hero | PageDetail_Entry_Default;"
    );
    expect(code).toContain("export type PageDetail_Asset = {");
    expect(code).toContain("export type PageDetailResult = PageDetail_Page;");
    expect(code).not.toContain("PageDetail_CustomReference");
  });

  it("aliases empty on TabCollection to TabCollectionPayload (opaque passthrough)", () => {
    const source = `
      scalar TabId on string;
      scalar TabsId on string;
      scalar Locale on string;

      resource Tab(id: TabId, locale: Locale): { id }
      resource TabCollection(tabsId: TabsId, locale: Locale): Tab[]
      resource Page(id: string, locale: Locale): { id tabsId: TabsId }

      query Q(pageId: string) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand tabs: TabCollection(tabsId: p.tabsId, locale: context.locale)
        }
        on TabCollection t { }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program!);
    expect(code).toContain("export type Q_TabCollection = TabCollectionPayload;");
    expect(code).toContain("tabs: Q_TabCollection;");
    expect(code).not.toContain("export type Q_TabCollection = {");
    expect(code).not.toContain("Q_Tab[]");
  });

  it("strips resolve-to-each TabCollection aliases to Tab[] (no TabCollection type)", () => {
    const source = `
      scalar TabId on string;
      scalar TabsId on string;
      scalar Locale on string;
      scalar StripId on string;

      resource Strip(id: StripId, locale: Locale): { id }
      resource Tab(id: TabId, locale: Locale): {
        id
        stripsIds: StripId[]
      }
      resource TabCollection(tabsId: TabsId, locale: Locale): {
        tabsIds: { id: TabId }[]
      }
      resource Tabs(tabsId: TabsId, locale: Locale): { tabsId: TabsId }

      query Q(tabsId: TabsId) {
        context { locale: Locale }
        root Tabs(tabsId: tabsId, locale: context.locale)
        on Tabs t {
          expand tabs: TabCollection(tabsId: t.tabsId, locale: @t.locale)
        }
        on TabCollection tc resolve to each link in tc.tabsIds (
          Tab(id: link.id, locale: @tc.locale)
        )
        on Tab tab {
          id
          expand strips: each id in tab.stripsIds (
            Strip(id: id, locale: @tab.locale)
          )
        }
        on Strip s { id }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program!);
    expect(code).toContain("tabs: Q_Tab[];");
    expect(code).toContain("strips: Q_Strip[];");
    expect(code).toContain("export type Q_Tab = {");
    expect(code).toContain("export type Q_Strip = {");
    expect(code).not.toContain("Q_TabCollection");
    expect(code).not.toContain("items.tabs");
  });

  it("widens resolve-to-each strip for on failure set null", () => {
    const source = `
      scalar TabId on string;
      scalar TabsId on string;
      scalar Locale on string;

      resource Tab(id: TabId, locale: Locale): { id }
      resource TabCollection(tabsId: TabsId, locale: Locale): {
        tabsIds: { id: TabId }[]
      }
      resource Tabs(tabsId: TabsId, locale: Locale): { tabsId: TabsId }

      query Q(tabsId: TabsId) {
        context { locale: Locale }
        root Tabs(tabsId: tabsId, locale: context.locale)
        on Tabs t {
          expand tabs: TabCollection(tabsId: t.tabsId, locale: @t.locale)
        }
        on TabCollection tc resolve to each link in tc.tabsIds (
          Tab(id: link.id, locale: @tc.locale) on failure set null
        )
        on Tab tab { id }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program!);
    expect(code).toContain("tabs: (Q_Tab | null)[];");
    expect(code).not.toContain("Q_TabCollection");
  });

  it("strips polymorphic resolve-to-each to (Tab | Strip)[]", () => {
    const source = `
      scalar ItemId on string;
      scalar CollectionId on string;
      scalar Locale on string;

      resource Tab(id: ItemId, locale: Locale): { id }
      resource Strip(id: ItemId, locale: Locale): { id }
      resource MixedCollection(id: CollectionId, locale: Locale): {
        items: { id: ItemId, kind: "Tab" | "Strip" }[]
      }
      resource Page(id: string, locale: Locale): { collectionId: CollectionId }

      query Q(pageId: string) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          expand items: MixedCollection(id: p.collectionId, locale: @p.locale)
        }
        on MixedCollection c resolve to each item in c.items (
          Tab(id: item.id, locale: @c.locale) when item.kind == "Tab",
          Strip(id: item.id, locale: @c.locale) when item.kind == "Strip"
        )
        on Tab t { id }
        on Strip s { id }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program!);
    expect(code).toContain("items: (Q_Tab | Q_Strip)[];");
    expect(code).not.toContain("Q_MixedCollection");
  });

  it("matches pageDetailProgram() IR path to the fixture emit", () => {
    const fromIr = emitProjectionTypes(pageDetailProgram());
    const { program, diagnostics } = parseAndCheck(
      loadFixture("page-detail.ziel"),
      "file:///fixtures/page-detail.ziel"
    );
    expect(diagnostics).toEqual([]);
    expect(normalizeWhitespace(fromIr)).toBe(normalizeWhitespace(emitProjectionTypes(program)));
  });
});

describe("printExpansionAliasType", () => {
  it("prints Entry / Asset aliases for page-detail expansions", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("page-detail.ziel"));
    expect(diagnostics).toEqual([]);

    const resources = new Map(
      program.resources.map((r) => [
        r.name,
        {
          identity: new Map(r.identity.fields.map((f) => [f.name, f])),
          payload: new Map(
            (r.payloadType.kind === "object" ? r.payloadType.fields : []).map((f) => [f.name, f])
          ),
          payloadType: r.payloadType,
        },
      ])
    );
    const query = program.queries[0]!;
    const projected = new Set(query.projections.map((p) => p.resource));
    const projectionsByResource = new Map(query.projections.map((p) => [p.resource, p]));
    const resolveTargets = new Map();

    const page = query.projections.find((p) => p.resource === "Page")!;
    const pageResource = resources.get("Page")!;
    const pageContext = {
      sourcePayload: pageResource.payloadType,
      projectionsByResource,
    };
    const strips = page.expansions.find((e) => e.alias === "strips")!;
    expect(
      printExpansionAliasType(
        "PageDetail",
        strips,
        resources,
        projected,
        resolveTargets,
        pageContext
      )
    ).toBe("PageDetail_Entry[]");

    const menu = page.expansions.find((e) => e.alias === "menu")!;
    expect(
      printExpansionAliasType("PageDetail", menu, resources, projected, resolveTargets, pageContext)
    ).toBe("PageDetail_Entry_Menu");
    const footer = page.expansions.find((e) => e.alias === "footer")!;
    expect(
      printExpansionAliasType(
        "PageDetail",
        footer,
        resources,
        projected,
        resolveTargets,
        pageContext
      )
    ).toBe("PageDetail_Entry_Footer");

    const entry = query.projections.find((p) => p.resource === "Entry")!;
    const tabsArm = entry.arms!.find((arm) => arm.expansions.some((e) => e.alias === "tabs"))!;
    const tabsEdge = tabsArm.expansions.find((e) => e.alias === "tabs")!;
    expect(printExpansionAliasType("PageDetail", tabsEdge, resources, projected)).toBe(
      "PageDetail_Entry[]"
    );

    const heroArm = entry.arms!.find((arm) => arm.expansions.some((e) => e.alias === "image"))!;
    const image = heroArm.expansions.find((e) => e.alias === "image")!;
    expect(printExpansionAliasType("PageDetail", image, resources, projected)).toBe(
      "PageDetail_Asset"
    );
  });

  it("narrows armed Entry aliases from source-field refers", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Menu", id, title: string }
        | { type: "Footer", id, title: string }
        | { type: "Hero", id, title: string }

      resource Page(id: EntryId, locale: Locale): {
        id
        menuId: EntryId refers Entry with { type: "Menu" }
        chromeId: EntryId refers Entry with { type: "Menu" | "Footer" }
        plainId: EntryId
        strips: {
          id: EntryId refers Entry with { type: "Hero" }
        }[]
      }

      query PageDetail(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand menu: Entry(id: p.menuId, locale: @p.locale)
          expand chrome: Entry(id: p.chromeId, locale: @p.locale)
          expand plain: Entry(id: p.plainId, locale: @p.locale)
          expand strips: each link in p.strips (
            Entry(id: link.id, locale: @p.locale)
          )
        }
        on Entry e {
          when e.type == "Menu" { id title }
          when e.type == "Footer" { id title }
          when e.type == "Hero" { id title }
          default { }
        }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program!);
    expect(code).toContain("menu: PageDetail_Entry_Menu;");
    expect(code).toContain("chrome: PageDetail_Entry_Menu | PageDetail_Entry_Footer;");
    expect(code).toContain("plain: PageDetail_Entry;");
    expect(code).toContain("strips: PageDetail_Entry_Hero[];");
    expect(code).not.toContain("menu: PageDetail_Entry;");
  });

  it("does not structurally narrow flat (non-armed) on R from refers", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale): {
        type: "Menu"
        id
        title: string
      }

      resource Page(id: EntryId, locale: Locale): {
        id
        menuId: EntryId refers Entry with { type: "Menu" }
      }

      query PageDetail(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand menu: Entry(id: p.menuId, locale: @p.locale)
        }
        on Entry e { id title }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);
    const code = emitProjectionTypes(program!);
    expect(code).toContain("menu: PageDetail_Entry;");
    expect(code).not.toContain("PageDetail_Entry_Menu");
  });

  it("uses Default variant when refers matches an arm covered only by default", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Menu", id, title: string }
        | { type: "Footer", id, title: string }

      resource Page(id: EntryId, locale: Locale): {
        id
        menuId: EntryId refers Entry with { type: "Menu" | "Footer" }
      }

      query PageDetail(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand menu: Entry(id: p.menuId, locale: @p.locale)
        }
        on Entry e {
          when e.type == "Menu" { id title }
          default { }
        }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);
    const code = emitProjectionTypes(program!);
    expect(code).toContain("menu: PageDetail_Entry_Menu | PageDetail_Entry_Default;");
  });

  it("throws REFERS_ARM_NOT_PROJECTED when defaultArm is missing on hand-built IR", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Menu", id, title: string }
        | { type: "Footer", id, title: string }

      resource Page(id: EntryId, locale: Locale): {
        id
        menuId: EntryId refers Entry with { type: "Menu" | "Footer" }
      }

      query PageDetail(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand menu: Entry(id: p.menuId, locale: @p.locale)
        }
        on Entry e {
          when e.type == "Menu" { id title }
          default { }
        }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);
    program!.queries[0]!.projections.find((p) => p.resource === "Entry")!.defaultArm = null;
    expect(() => emitProjectionTypes(program!)).toThrow(/REFERS_ARM_NOT_PROJECTED/);
  });

  it("widens expansion aliases for on failure set null / set error", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale): { id title: string }
      resource Page(id: EntryId, locale: Locale): {
        id
        menuId: EntryId
        related: { id: EntryId }[]
      }

      query PageDetail(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand menu: Entry(id: p.menuId, locale: @p.locale) on failure set null
          expand soft: Entry(id: p.menuId, locale: @p.locale) on failure set error
          expand related: each link in p.related (
            Entry(id: link.id, locale: @p.locale) on failure set null
          )
        }
        on Entry e { id title }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const resources = new Map(
      program!.resources.map((r) => [
        r.name,
        {
          identity: new Map(r.identity.fields.map((f) => [f.name, f])),
          payload: new Map(
            (r.payloadType.kind === "object" ? r.payloadType.fields : []).map((f) => [f.name, f])
          ),
          payloadType: r.payloadType,
        },
      ])
    );
    const query = program!.queries[0]!;
    const projected = new Set(query.projections.map((p) => p.resource));
    const page = query.projections.find((p) => p.resource === "Page")!;

    expect(printExpansionAliasType("PageDetail", page.expansions[0]!, resources, projected)).toBe(
      "PageDetail_Entry | null"
    );
    expect(printExpansionAliasType("PageDetail", page.expansions[1]!, resources, projected)).toBe(
      "PageDetail_Entry | ResolutionError"
    );
    expect(printExpansionAliasType("PageDetail", page.expansions[2]!, resources, projected)).toBe(
      "(PageDetail_Entry | null)[]"
    );
  });
});
