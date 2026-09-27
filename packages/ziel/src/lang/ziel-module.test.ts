import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isContextRef,
  isFragmentDeclaration,
  isFragmentSpread,
  isIdentityRef,
  isModel,
  isNamedTypeExpr,
  isObjectTypeExpr,
  isPathRef,
  isQueryDeclaration,
  isResourceDeclaration,
  isScalarDeclaration,
  type Model,
  type QueryDeclaration,
  type ResourceDeclaration,
} from "./generated/ast.js";
import { createZielServices } from "./ziel-module.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function parseSource(source: string): Model {
  const { Ziel } = createZielServices();
  const result = Ziel.parser.LangiumParser.parse(source);
  expect(result.parserErrors, JSON.stringify(result.parserErrors)).toEqual([]);
  expect(result.lexerErrors, JSON.stringify(result.lexerErrors)).toEqual([]);
  expect(isModel(result.value)).toBe(true);
  return result.value as Model;
}

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("Ziel MVP grammar", () => {
  it("parses PostDetail from analysis", () => {
    const model = parseSource(loadFixture("post-detail.ziel"));
    expect(model.declarations.filter(isScalarDeclaration)).toHaveLength(3);
    expect(model.declarations.filter(isResourceDeclaration)).toHaveLength(2);

    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    expect(query.name).toBe("PostDetail");
    expect(query.parameters.map((p) => p.name)).toEqual(["postId"]);
    expect(query.context?.fields.map((f) => f.name)).toEqual(["locale"]);
    expect(query.root?.construction.resource).toBe("Post");
    const localeArg = query.root?.construction.args.find((a) => a.name === "locale")?.value;
    expect(localeArg && isContextRef(localeArg)).toBe(true);
    if (localeArg && isContextRef(localeArg)) {
      expect(localeArg.path).toEqual(["locale"]);
    }
    expect(query.projections).toHaveLength(2);
    expect(query.projections[0]?.binding).toBe("p");
    expect(query.projections[0]?.selectedFields).toEqual(["id", "title", "content"]);
    expect(query.projections[0]?.expansions[0]?.alias).toBe("author");

    const authorArg = query.projections[0]?.expansions[0]?.target?.args[0]?.value;
    expect(authorArg && isPathRef(authorArg)).toBe(true);
    if (authorArg && isPathRef(authorArg)) {
      expect(authorArg.segments).toEqual(["p", "authorId"]);
    }
  });

  it("parses page-detail.ziel mirroring the IR fixture", () => {
    const model = parseSource(loadFixture("page-detail.ziel"));
    expect(model.declarations.filter(isScalarDeclaration)).toHaveLength(7);
    expect(model.declarations.filter(isResourceDeclaration)).toHaveLength(4);
    expect(model.declarations.filter(isFragmentDeclaration)).toHaveLength(0);

    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    expect(query.name).toBe("PageDetail");
    expect(query.projections.map((p) => p.resource)).toEqual([
      "Page",
      "CustomReference",
      "Entry",
      "Asset",
    ]);

    const page = model.declarations.find(
      (d): d is ResourceDeclaration => isResourceDeclaration(d) && d.name === "Page"
    );
    const stripsExpand = query.projections[0]?.expansions.find((e) => e.alias === "strips");
    expect(stripsExpand?.each?.itemBinding).toBe("link");
    expect(stripsExpand?.each?.arms.map((a) => a.target.resource)).toEqual(["Entry"]);
    expect(stripsExpand?.target).toBeUndefined();

    const relatedExpand = query.projections[0]?.expansions.find((e) => e.alias === "related");
    expect(relatedExpand?.each?.itemBinding).toBe("ref");
    expect(relatedExpand?.each?.arms.map((a) => a.target.resource)).toEqual(["CustomReference"]);

    const entry = query.projections.find((p) => p.resource === "Entry");
    expect(entry?.include).toBeUndefined();
    expect(entry?.whenArms).toHaveLength(8);
    expect(entry?.whenArms.every((arm) => arm.include?.includes("properties"))).toBe(true);
    const tabsArm = entry?.whenArms.find((arm) => arm.expansions.some((e) => e.alias === "tabs"));
    const tabsExpand = tabsArm?.expansions.find((e) => e.alias === "tabs");
    expect(tabsExpand?.each?.itemBinding).toBe("link");
    expect(tabsExpand?.each?.arms.map((a) => a.target.resource)).toEqual(["Entry"]);
    expect(tabsExpand?.target).toBeUndefined();

    expect(page?.name).toBe("Page");
  });

  it("parses projection when-arms inside on blocks", () => {
    const model = parseSource(`
      scalar EntryId on string;
      scalar Locale on string;
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

    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    const entry = query.projections.find((p) => p.resource === "Entry");
    expect(entry?.whenArms).toHaveLength(2);
    expect(entry?.selectedFields).toEqual([]);
    expect(entry?.expansions).toEqual([]);
    expect(entry?.whenArms[0]?.selectedFields).toEqual(["id", "title"]);
    expect(entry?.whenArms[0]?.expansions[0]?.alias).toBe("image");
    expect(entry?.whenArms[1]?.selectedFields).toEqual(["id"]);
    expect(entry?.whenArms[1]?.expansions).toEqual([]);

    const whenExpr = entry?.whenArms[0]?.when;
    expect(whenExpr?.$type).toBe("BinaryExpr");
  });

  it("parses identity refs, literals, and payload shorthand", () => {
    const model = parseSource(`
      scalar PostId on string;
      scalar UserId on string;

      resource Post(id: PostId): {
        id
        authorId: UserId
        published: boolean
      }

      resource User(id: UserId): {
        id
      }

      query BadIdentity(postId: PostId) {
        root Post(id: postId, flag: true, n: 1, s: "hi", z: null)
        on Post p {
          id
          expand author: User(id: @p.id)
        }
      }
    `);

    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    const args = query.root!.construction.args;
    expect(args.map((a) => a.name)).toEqual(["id", "flag", "n", "s", "z"]);
    expect(args[1]?.value.$type).toBe("BooleanLiteral");
    expect(args[2]?.value.$type).toBe("NumberLiteral");
    expect(args[3]?.value.$type).toBe("StringLiteral");
    expect(args[4]?.value.$type).toBe("NullLiteral");

    const idArg = query.projections[0]?.expansions[0]?.target?.args[0]?.value;
    expect(idArg && isIdentityRef(idArg)).toBe(true);
    if (idArg && isIdentityRef(idArg)) {
      expect(idArg.binding).toBe("p");
      expect(idArg.path).toEqual(["id"]);
    }

    const post = model.declarations.find(
      (d): d is ResourceDeclaration => isResourceDeclaration(d) && d.name === "Post"
    );
    expect(isObjectTypeExpr(post?.payloadType)).toBe(true);
    if (post && isObjectTypeExpr(post.payloadType)) {
      expect(post.payloadType.fields[0]?.name).toBe("id");
      expect(post.payloadType.fields[0]?.type).toBeUndefined();
      expect(post.payloadType.fields[1]?.type?.$type).toBe("NamedTypeExpr");
    }
  });

  it("parses inline object types and postfix arrays", () => {
    const model = parseSource(`
      scalar MenuId on string;
      scalar Locale on string;
      scalar AssetId on string;

      resource Menu(id: MenuId, locale: Locale): {
        id
        title: string
        logoId: AssetId
        meta: {
          count: number;
          isActive: boolean;
          name: string;
        }
        slides: {
          name: string;
        }[]
        tags: string[]
      }
    `);

    const menu = model.declarations.find(isResourceDeclaration) as ResourceDeclaration;
    expect(isObjectTypeExpr(menu.payloadType)).toBe(true);
    if (!isObjectTypeExpr(menu.payloadType)) return;

    const meta = menu.payloadType.fields.find((p) => p.name === "meta")?.type;
    expect(meta?.$type).toBe("ObjectTypeExpr");
    if (meta?.$type === "ObjectTypeExpr") {
      expect(meta.fields.map((f) => f.name)).toEqual(["count", "isActive", "name"]);
    }

    const slides = menu.payloadType.fields.find((p) => p.name === "slides")?.type;
    expect(slides?.$type).toBe("ArrayTypeExpr");
    if (slides?.$type === "ArrayTypeExpr") {
      expect(slides.of.$type).toBe("ObjectTypeExpr");
    }

    const tags = menu.payloadType.fields.find((p) => p.name === "tags")?.type;
    expect(tags?.$type).toBe("ArrayTypeExpr");
    if (tags?.$type === "ArrayTypeExpr") {
      expect(tags.of.$type).toBe("PrimitiveTypeExpr");
    }
  });

  it("parses string literal types, unions, and resource-array payloads", () => {
    const model = parseSource(`
      scalar HeroId on string;
      scalar ProductId on string;
      scalar TabId on string;
      scalar TabsId on string;
      scalar Locale on string;

      resource Tab(id: TabId, locale: Locale): {
        id
        strips: (
          { type: "Hero", id: HeroId }
          | { type: "Product", id: ProductId }
        )[]
        kind: "Hero" | "Product"
      }

      resource TabCollection(tabsId: TabsId, locale: Locale): Tab[]
    `);

    const tab = model.declarations.find(
      (d): d is ResourceDeclaration => isResourceDeclaration(d) && d.name === "Tab"
    )!;
    expect(isObjectTypeExpr(tab.payloadType)).toBe(true);
    if (isObjectTypeExpr(tab.payloadType)) {
      const kind = tab.payloadType.fields.find((p) => p.name === "kind")?.type;
      expect(kind?.$type).toBe("UnionTypeExpr");
    }

    const collection = model.declarations.find(
      (d): d is ResourceDeclaration => isResourceDeclaration(d) && d.name === "TabCollection"
    )!;
    expect(collection.payloadType.$type).toBe("ArrayTypeExpr");
    if (collection.payloadType.$type === "ArrayTypeExpr") {
      expect(isNamedTypeExpr(collection.payloadType.of)).toBe(true);
      if (isNamedTypeExpr(collection.payloadType.of)) {
        expect(collection.payloadType.of.name).toBe("Tab");
      }
    }
  });

  it("parses fragment declarations and nested spreads", () => {
    const model = parseSource(`
      scalar EntryId on string;
      scalar Locale on string;
      scalar AssetId on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id, title: string }
        | { type: "Menu", id, title: string, logoId: AssetId }

      resource Asset(id: AssetId, locale: Locale): { id }

      fragment EntryBase on Entry e { type id }

      fragment EntryLogo on Entry e {
        ...EntryBase
        title
        expand logo: Asset(id: e.logoId, locale: context.locale)
      }

      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Menu" { ...EntryLogo }
        }
        on Asset a { id }
      }
    `);

    const fragments = model.declarations.filter(isFragmentDeclaration);
    expect(fragments.map((f) => f.name)).toEqual(["EntryBase", "EntryLogo"]);
    expect(fragments[0]?.selectedFields).toEqual(["type", "id"]);
    expect(fragments[1]?.spreads).toHaveLength(1);
    expect(fragments[1]?.spreads[0]?.name).toBe("EntryBase");
    expect(fragments[1]?.selectedFields).toEqual(["title"]);
    expect(fragments[1]?.expansions[0]?.alias).toBe("logo");

    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    const menuArm = query.projections[0]?.whenArms[0];
    expect(menuArm?.spreads).toHaveLength(1);
    expect(isFragmentSpread(menuArm?.spreads[0])).toBe(true);
    expect(menuArm?.spreads[0]?.name).toBe("EntryLogo");
  });

  it("parses on-level preamble (...EntryBase) before when-arms", () => {
    const model = parseSource(`
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale):
        { type: "Hero", id }
        | { type: "Page", id }

      fragment EntryBase on Entry e { type id }

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

    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    const entry = query.projections[0]!;
    expect(entry.spreads.map((s) => s.name)).toEqual(["EntryBase"]);
    expect(entry.selectedFields).toEqual([]);
    expect(entry.expansions).toEqual([]);
    expect(entry.whenArms).toHaveLength(2);
    expect(entry.whenArms[0]?.selectedFields).toEqual([]);
    expect(entry.whenArms[1]?.selectedFields).toEqual([]);
  });

  it("rejects fields after the first when-arm (trailing projection items)", () => {
    const { Ziel } = createZielServices();
    const result = Ziel.parser.LangiumParser.parse(`
      scalar EntryId on string;
      scalar Locale on string;
      resource Entry(id: EntryId, locale: Locale): { type: "Hero", id }
      query Q(entryId: EntryId) {
        context { locale: Locale }
        root Entry(id: entryId, locale: context.locale)
        on Entry e {
          when e.type == "Hero" { id }
          title
        }
      }
    `);
    expect(result.parserErrors.length).toBeGreaterThan(0);
  });

  it("parses multi-root queries with aliased constructions", () => {
    const model = parseSource(`
      scalar PageId on string;
      scalar SessionId on string;

      resource Page(id: PageId): { id }
      resource UserSession(id: SessionId): { id }

      query Homepage(pageId: PageId, sessionId: SessionId) {
        roots {
          page: Page(id: pageId)
          session: UserSession(id: sessionId)
        }
        on Page p { id }
        on UserSession s { id }
      }
    `);

    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    expect(query.root).toBeUndefined();
    expect(query.roots?.entries.map((e) => e.alias)).toEqual(["page", "session"]);
    expect(query.roots?.entries.map((e) => e.construction.resource)).toEqual([
      "Page",
      "UserSession",
    ]);
  });

  it("rejects both root and roots in the same query", () => {
    const { Ziel } = createZielServices();
    const result = Ziel.parser.LangiumParser.parse(`
      scalar Id on string;
      resource R(id: Id): { id }
      query Q(id: Id) {
        root R(id: id)
        roots {
          a: R(id: id)
        }
      }
    `);
    expect(result.parserErrors.length).toBeGreaterThan(0);
  });

  it("parses an empty roots block", () => {
    const { Ziel } = createZielServices();
    const result = Ziel.parser.LangiumParser.parse(`
      scalar Id on string;
      resource R(id: Id): { id }
      query Q(id: Id) {
        roots {}
      }
    `);
    expect(result.parserErrors).toEqual([]);
    const query = (result.value as Model).declarations.find(isQueryDeclaration) as QueryDeclaration;
    expect(query.roots?.entries).toEqual([]);
  });

  it("parses include all / include properties / include none on projection clauses", () => {
    const model = parseSource(`
      scalar Id on string;
      resource Page(id: Id): { id: Id, title: string }
      query Q(id: Id) {
        root Page(id: id)
        on Page p include all { id }
        on Page q include properties { title }
        on Page n include none { title }
        on Page r { id }
      }
    `);
    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    expect(query.projections.map((p) => p.include)).toEqual([
      "includeall",
      "includeproperties",
      "includenone",
      undefined,
    ]);
  });

  it("parses include all / include properties / include none on projection when-arms", () => {
    const model = parseSource(`
      scalar Id on string;
      resource Entry(id: Id):
        { type: "Hero", id, title: string }
        | { type: "Page", id }
      query Q(id: Id) {
        root Entry(id: id)
        on Entry e {
          when e.type == "Hero" include all { id }
          when e.type == "Page" include properties { }
          when e.type == "Hero" include none { id }
          when e.type == "Hero" { id }
        }
      }
    `);
    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    const clause = query.projections[0]!;
    expect(clause.whenArms.map((arm) => arm.include)).toEqual([
      "includeall",
      "includeproperties",
      "includenone",
      undefined,
    ]);
  });
});
