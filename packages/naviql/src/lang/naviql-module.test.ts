import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isContextRef,
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
import { createNaviQlServices } from "./naviql-module.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

function parseSource(source: string): Model {
  const { NaviQl } = createNaviQlServices();
  const result = NaviQl.parser.LangiumParser.parse(source);
  expect(result.parserErrors, JSON.stringify(result.parserErrors)).toEqual([]);
  expect(result.lexerErrors, JSON.stringify(result.lexerErrors)).toEqual([]);
  expect(isModel(result.value)).toBe(true);
  return result.value as Model;
}

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("NaviQl MVP grammar", () => {
  it("parses PostDetail from analysis", () => {
    const model = parseSource(loadFixture("post-detail.naviql"));
    expect(model.declarations.filter(isScalarDeclaration)).toHaveLength(3);
    expect(model.declarations.filter(isResourceDeclaration)).toHaveLength(2);

    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    expect(query.name).toBe("PostDetail");
    expect(query.parameters.map((p) => p.name)).toEqual(["postId"]);
    expect(query.context?.fields.map((f) => f.name)).toEqual(["locale"]);
    expect(query.root.construction.resource).toBe("Post");
    const localeArg = query.root.construction.args.find((a) => a.name === "locale")?.value;
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

  it("parses page-detail.naviql mirroring the IR fixture", () => {
    const model = parseSource(loadFixture("page-detail.naviql"));
    expect(model.declarations.filter(isScalarDeclaration)).toHaveLength(7);
    expect(model.declarations.filter(isResourceDeclaration)).toHaveLength(10);

    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    expect(query.name).toBe("PageDetail");
    expect(query.projections.map((p) => p.resource)).toEqual([
      "Page",
      "Hero",
      "Menu",
      "Footer",
      "Asset",
      "Tabs",
      "Tab",
      "Product",
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

    const tabsExpand = query.projections
      .find((p) => p.resource === "Tabs")
      ?.expansions.find((e) => e.alias === "tabs");
    expect(tabsExpand?.each?.itemBinding).toBe("link");
    expect(tabsExpand?.each?.arms.map((a) => a.target.resource)).toEqual(["Tab"]);
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
    const args = query.root.construction.args;
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
});
