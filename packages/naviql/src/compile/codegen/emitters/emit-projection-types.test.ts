import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { pageDetailProgram } from "../../../fixtures";
import type { Program } from "../../../ir";
import { parseAndCheck } from "../../parse-and-check";
import { emitProjectionTypes, printExpansionAliasType } from "./emit-projection-types";
import { projectFnName, projectionTypeName, queryResultTypeName } from "../naming";

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
  });
});

describe("emitProjectionTypes", () => {
  it("returns empty string when there are no queries", () => {
    const program: Program = {
      scalars: [],
      resources: [],
      queries: [],
      span: null,
    };
    expect(emitProjectionTypes(program)).toBe("");
  });

  it("emits $type, selected fields, and restored aliases for post-detail", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("post-detail.naviql"),
      "file:///fixtures/post-detail.naviql"
    );
    expect(diagnostics).toEqual([]);

    expect(normalizeWhitespace(emitProjectionTypes(program))).toBe(
      normalizeWhitespace(`
export type PostDetail_Post = {
  $type: "Post";
  id: PostId;
  title: string;
  content: string;
  author: PostDetail_User;
};

export type PostDetail_User = {
  $type: "User";
  id: UserId;
  username: string;
};

export type PostDetailResult = PostDetail_Post;
`)
    );
  });

  it("emits union strip and collection array aliases for page-detail", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("page-detail.naviql"),
      "file:///fixtures/page-detail.naviql"
    );
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program);

    expect(code).toContain(`$type: "Page";`);
    expect(code).toContain("strips: (PageDetail_Hero | PageDetail_Tabs | PageDetail_Product)[];");
    expect(code).toContain(
      "related: (PageDetail_Hero | PageDetail_Tabs | PageDetail_Product | PageDetail_Asset)[];"
    );
    expect(code).toContain("tabs: PageDetail_Tab[];");
    expect(code).toContain("menu: PageDetail_Menu;");
    expect(code).toContain("image: PageDetail_Asset;");
    expect(code).toContain(`kind: "image" | "video" | "document";`);
    expect(code).toContain("export type PageDetailResult = PageDetail_Page;");
    expect(code).not.toContain("PageDetail_EditorialModule");
    expect(code).not.toContain("TabCollection");
    expect(code).not.toContain("PageDetail_Entry");
    expect(code).not.toContain("PageDetail_CustomReference");
  });

  it("matches pageDetailProgram() IR path to the fixture emit", () => {
    const fromIr = emitProjectionTypes(pageDetailProgram());
    const { program, diagnostics } = parseAndCheck(
      loadFixture("page-detail.naviql"),
      "file:///fixtures/page-detail.naviql"
    );
    expect(diagnostics).toEqual([]);
    expect(normalizeWhitespace(fromIr)).toBe(normalizeWhitespace(emitProjectionTypes(program)));
  });
});

describe("printExpansionAliasType", () => {
  it("prints union / collection / one aliases for page-detail expansions", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("page-detail.naviql"));
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

    const page = query.projections.find((p) => p.resource === "Page")!;
    const strips = page.expansions.find((e) => e.alias === "strips")!;
    expect(printExpansionAliasType("PageDetail", strips, resources, projected)).toBe(
      "(PageDetail_Hero | PageDetail_Tabs | PageDetail_Product)[]"
    );

    const tabs = query.projections.find((p) => p.resource === "Tabs")!;
    const tabsEdge = tabs.expansions.find((e) => e.alias === "tabs")!;
    expect(printExpansionAliasType("PageDetail", tabsEdge, resources, projected)).toBe(
      "PageDetail_Tab[]"
    );

    const hero = query.projections.find((p) => p.resource === "Hero")!;
    const image = hero.expansions.find((e) => e.alias === "image")!;
    expect(printExpansionAliasType("PageDetail", image, resources, projected)).toBe(
      "PageDetail_Asset"
    );
  });
});
