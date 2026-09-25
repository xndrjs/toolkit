import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isContextRef,
  isIdentityRef,
  isModel,
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

    const authorArg = query.projections[0]?.expansions[0]?.target.args[0]?.value;
    expect(authorArg && isPathRef(authorArg)).toBe(true);
    if (authorArg && isPathRef(authorArg)) {
      expect(authorArg.segments).toEqual(["p", "authorId"]);
    }
  });

  it("parses page-detail.naviql mirroring the IR fixture", () => {
    const model = parseSource(loadFixture("page-detail.naviql"));
    expect(model.declarations.filter(isScalarDeclaration)).toHaveLength(10);
    expect(model.declarations.filter(isResourceDeclaration)).toHaveLength(8);

    const query = model.declarations.find(isQueryDeclaration) as QueryDeclaration;
    expect(query.name).toBe("PageDetail");
    expect(query.projections).toHaveLength(8);
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
  });

  it("parses identity refs, literals, and payload shorthand", () => {
    const model = parseSource(`
      scalar PostId on string;
      scalar UserId on string;

      resource Post(id: PostId) {
        id
        authorId: UserId
        published: boolean
      }

      resource User(id: UserId) {
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

    const idArg = query.projections[0]?.expansions[0]?.target.args[0]?.value;
    expect(idArg && isIdentityRef(idArg)).toBe(true);
    if (idArg && isIdentityRef(idArg)) {
      expect(idArg.binding).toBe("p");
      expect(idArg.path).toEqual(["id"]);
    }

    const post = model.declarations.find(
      (d): d is ResourceDeclaration => isResourceDeclaration(d) && d.name === "Post"
    );
    expect(post?.payload[0]?.name).toBe("id");
    expect(post?.payload[0]?.type).toBeUndefined();
    expect(post?.payload[1]?.type?.$type).toBe("ScalarTypeExpr");
  });

  it("parses inline object types and postfix arrays", () => {
    const model = parseSource(`
      scalar MenuId on string;
      scalar Locale on string;
      scalar AssetId on string;

      resource Menu(id: MenuId, locale: Locale) {
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
    const meta = menu.payload.find((p) => p.name === "meta")?.type;
    expect(meta?.$type).toBe("ObjectTypeExpr");
    if (meta?.$type === "ObjectTypeExpr") {
      expect(meta.fields.map((f) => f.name)).toEqual(["count", "isActive", "name"]);
    }

    const slides = menu.payload.find((p) => p.name === "slides")?.type;
    expect(slides?.$type).toBe("ArrayTypeExpr");
    if (slides?.$type === "ArrayTypeExpr") {
      expect(slides.of.$type).toBe("ObjectTypeExpr");
    }

    const tags = menu.payload.find((p) => p.name === "tags")?.type;
    expect(tags?.$type).toBe("ArrayTypeExpr");
    if (tags?.$type === "ArrayTypeExpr") {
      expect(tags.of.$type).toBe("PrimitiveTypeExpr");
    }
  });
});
