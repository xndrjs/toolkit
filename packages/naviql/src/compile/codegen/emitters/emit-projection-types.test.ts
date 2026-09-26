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
  $type: "Entry";
  id: EntryId;
  title: string;
  image: EntryDetail_Asset;
};

export type EntryDetail_Entry_Page = {
  $type: "Entry";
  id: EntryId;
};

export type EntryDetail_Entry = EntryDetail_Entry_Hero | EntryDetail_Entry_Page;
`)
    );
    expect(code).toContain("export type EntryDetailResult = EntryDetail_Entry;");
    expect(code).not.toContain("EntryDetail_Hero");
  });

  it("emits union strip and Entry variant aliases for page-detail", () => {
    const { program, diagnostics } = parseAndCheck(
      loadFixture("page-detail.naviql"),
      "file:///fixtures/page-detail.naviql"
    );
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program);

    expect(code).toContain(`$type: "Page";`);
    expect(code).toContain("strips: PageDetail_Entry[];");
    expect(code).toContain("related: (PageDetail_Entry | PageDetail_Asset)[];");
    expect(code).toContain("tabs: PageDetail_Entry[];");
    expect(code).toContain("menu: PageDetail_Entry;");
    expect(code).toContain("image: PageDetail_Asset;");
    expect(code).toContain("export type PageDetail_Entry_Hero = {");
    expect(code).toContain("export type PageDetail_Entry_Page = {");
    expect(code).toContain("export type PageDetail_Entry =");
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
        }
        on Asset a { id url }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitProjectionTypes(program!);

    expect(code).toContain("related: (PageDetail_Entry | PageDetail_Asset)[];");
    expect(code).toContain("export type PageDetail_Entry_Hero = {");
    expect(code).toContain("export type PageDetail_Entry = PageDetail_Entry_Hero;");
    expect(code).toContain("export type PageDetail_Asset = {");
    expect(code).toContain("export type PageDetailResult = PageDetail_Page;");
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
  it("prints Entry / Asset aliases for page-detail expansions", () => {
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
      "PageDetail_Entry[]"
    );

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
});
