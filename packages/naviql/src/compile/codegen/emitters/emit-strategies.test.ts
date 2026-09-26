import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  arg,
  construct,
  ctx,
  eq,
  expand,
  expandEach,
  field,
  item,
  lit,
  param,
  payload,
  projection,
  query,
  resource,
  scalarRef,
} from "../../../fixtures";
import type { Program } from "../../../ir";
import { parseAndCheck } from "../../parse-and-check";
import { emitStrategies } from "./emit-strategies";
import { generateStrategies } from "../generators/generate-strategies";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function emptyProgram(): Program {
  return { scalars: [], resources: [], queries: [], span: null };
}

describe("emitStrategies", () => {
  it("returns empty string when there are no queries", () => {
    expect(emitStrategies(emptyProgram())).toBe("");
  });

  it("skips projections with no expansions and leaves the builder open", () => {
    const program: Program = {
      ...emptyProgram(),
      scalars: [],
      resources: [
        resource("Post", [field("id", scalarRef("PostId"))], {
          kind: "object",
          fields: [field("authorId", scalarRef("UserId"))],
          span: null,
        }),
        resource("User", [field("id", scalarRef("UserId"))], {
          kind: "object",
          fields: [],
          span: null,
        }),
      ],
      queries: [
        query("PostDetail", {
          parameters: [field("postId", scalarRef("PostId"))],
          context: [field("locale", scalarRef("Locale"))],
          root: construct("Post", [arg("id", param("postId"))]),
          projections: [
            projection(
              "Post",
              "p",
              ["id"],
              [expand("author", construct("User", [arg("id", payload("p", "authorId"))]))]
            ),
            projection("User", "u", ["id"]),
          ],
        }),
      ],
    };

    const code = emitStrategies(program);

    expect(code).toContain("export type PostDetailParams");
    expect(code).toContain("export type PostDetailExecutionContext");
    expect(code).toContain("export function createPostDetailStrategy(params: PostDetailParams)");
    expect(code).toContain(".on(postAri)");
    expect(code).toContain("userAri({ id: payload.authorId })");
    expect(code).not.toContain(".on(userAri)");
    expect(code).not.toContain(".build()");
    expect(code).not.toContain(".when(");
    expect(code).not.toContain("islands");
    expect(code).toMatch(/return strategy;\s*}/);
  });

  it("emits .when() per expanding arm of an armed on Entry", () => {
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

    const code = emitStrategies(program!);

    expect(code).toContain(".on(entryAri)");
    expect(code).toContain(
      '.when(({ resource, payload, executionContext }) => payload.type == "Hero")'
    );
    expect(code).toContain("assetAri({ id: payload.imageId, locale: executionContext.locale })");
    // Page arm has no expansions — no second .when / empty expand.
    expect(code).not.toContain('payload.type == "Page"');
    expect(code.match(/\.on\(entryAri\)/g)).toHaveLength(1);
    expect(code).not.toContain(".build()");
  });

  it("emits each-arm filter+map and multi-arm concat", () => {
    const program: Program = {
      ...emptyProgram(),
      queries: [
        query("PageDetail", {
          parameters: [],
          context: [field("locale", scalarRef("Locale"))],
          root: construct("Page", []),
          projections: [
            projection(
              "Page",
              "p",
              ["id"],
              [
                expandEach("strips", "s", payload("p", "strips"), [
                  {
                    target: construct("Hero", [
                      arg("id", item("s", "id")),
                      arg("locale", ctx("locale")),
                    ]),
                    when: eq(item("s", "type"), lit("Hero")),
                  },
                ]),
              ]
            ),
          ],
        }),
      ],
    };

    const code = emitStrategies(program);

    expect(code).toContain("export function createPageDetailStrategy()");
    expect(code).toContain(
      'payload.strips.filter((s: any) => s.type == "Hero").map((s: any) => heroAri({ id: s.id, locale: executionContext.locale }))'
    );
  });
});

describe("generateStrategies", () => {
  it("wraps strategies with header + createGraphResolutionStrategy import", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("post-detail.naviql"));
    expect(diagnostics).toEqual([]);

    const { code } = generateStrategies(program!);

    expect(code).toMatch(/^\/\* Generated by @xndrjs\/naviql\/compile\./);
    expect(code).toContain('import { createGraphResolutionStrategy } from "@xndrjs/naviql";');
    expect(code).not.toMatch(/from\s+["']@xndrjs\/naviql\/compile["']/);
    expect(code).toContain("createPostDetailStrategy");
    expect(code).toContain("userAri({ id: payload.authorId })");
    expect(code).not.toContain(".build()");
  });

  it("emits Entry/CustomReference each strips and armed Entry .when for page-detail", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("page-detail.naviql"));
    expect(diagnostics).toEqual([]);

    const { code } = generateStrategies(program!);

    expect(code).toContain(".on(pageAri)");
    expect(code).toContain(
      "entryAri({ spaceId: resource.key[0].spaceId, environmentId: resource.key[0].environmentId, id: payload.menuId, locale: resource.key[0].locale })"
    );
    expect(code).toContain(
      "entryAri({ spaceId: resource.key[0].spaceId, environmentId: resource.key[0].environmentId, id: payload.footerId, locale: resource.key[0].locale })"
    );
    expect(code).toContain(
      "payload.strips.map((link: any) => entryAri({ spaceId: resource.key[0].spaceId, environmentId: resource.key[0].environmentId, id: link.id, locale: resource.key[0].locale }))"
    );
    expect(code).toContain(
      "payload.related.map((ref: any) => customReferenceAri({ ref: ref, locale: resource.key[0].locale }))"
    );
    expect(code).toContain(".on(entryAri)");
    expect(code).toContain(
      '.when(({ resource, payload, executionContext }) => payload.type == "Hero")'
    );
    expect(code).toContain(
      '.when(({ resource, payload, executionContext }) => payload.type == "Tabs")'
    );
    expect(code).toContain(
      "payload.tabs.map((link: any) => entryAri({ spaceId: resource.key[0].spaceId, environmentId: resource.key[0].environmentId, id: link.id, locale: resource.key[0].locale }))"
    );
    expect(code).not.toContain("heroAri");
    expect(code).not.toContain("tabAri");
    expect(code).not.toContain("tabCollectionAri");
    expect(code).not.toContain("editorialModuleAri");
    expect(code).not.toContain(".build()");
    expect(code).not.toContain("islands");
  });

  it("omits import when there are no queries", () => {
    const { code } = generateStrategies(emptyProgram());
    expect(code).toBe("/* Generated by @xndrjs/naviql/compile. Do not edit by hand. */\n");
  });
});
