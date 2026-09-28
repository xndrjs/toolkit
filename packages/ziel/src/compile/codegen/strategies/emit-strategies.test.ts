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
  singleRoot,
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
  return { scalars: [], resources: [], fragments: [], datasources: [], queries: [], span: null };
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
      fragments: [],
      datasources: [],
      queries: [
        query("PostDetail", {
          parameters: [field("postId", scalarRef("PostId"))],
          context: [field("locale", scalarRef("Locale"))],
          roots: singleRoot(construct("Post", [arg("id", param("postId"))])),
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
    expect(code).toContain("userAri({ id: predicate.payload.authorId })");
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
          default { }
        }
        on Asset a { id url }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program!);

    expect(code).toContain(".on(entryAri)");
    expect(code).toContain('.when((predicate) => predicate.payload.type == "Hero")');
    expect(code).toContain(
      "assetAri({ id: payload.imageId, locale: predicate.executionContext.locale })"
    );
    // Page arm has no expansions — no second .when / empty expand.
    expect(code).not.toContain('payload.type == "Page"');
    expect(code.match(/\.on\(entryAri\)/g)).toHaveLength(1);
    expect(code).not.toContain(".build()");
  });

  it("emits each-arm filter+map and multi-arm concat", () => {
    const program: Program = {
      ...emptyProgram(),
      fragments: [],
      datasources: [],
      queries: [
        query("PageDetail", {
          parameters: [],
          context: [field("locale", scalarRef("Locale"))],
          roots: singleRoot(construct("Page", [])),
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
      'predicate.payload.strips.filter((s: any) => s.type == "Hero").map((s: any) => heroAri({ id: s.id, locale: predicate.executionContext.locale }))'
    );
  });

  it("emits unconditional startIsland for island without when", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Page(id: EntryId, locale: Locale): { id }

      query PageDetail(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p { id }
        islands {
          on Page
        }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program!);

    expect(code).toContain("strategy.islands");
    expect(code).toContain(".on(pageAri)");
    expect(code).toContain(".startIsland()");
    expect(code).not.toContain("strategy.islands\n    .on(pageAri)\n    .when(");
    expect(code.match(/\.startIsland\(\)/g)).toHaveLength(1);
  });

  it("emits one islands.on.when.startIsland with or predicate", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale): {
        type: "Menu" | "Footer"
        id
      }

      query PageDetail(pageId: EntryId) {
        context { locale: Locale }
        root Entry(id: pageId, locale: context.locale)
        on Entry e { id type }
        islands {
          on Entry e when e.type == "Menu" or e.type == "Footer"
        }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program!);

    expect(code).toContain(
      [
        `  strategy.islands`,
        `    .on(entryAri)`,
        `    .when((predicate) => (predicate.payload.type == "Menu" || predicate.payload.type == "Footer"))`,
        `    .startIsland();`,
      ].join("\n")
    );
    expect(code.match(/\.startIsland\(\)/g)).toHaveLength(1);
    expect(code.match(/strategy\.islands/g)).toHaveLength(1);
  });
});

describe("generateStrategies", () => {
  it("wraps strategies with header + createGraphResolutionStrategy import", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("post-detail.ziel"));
    expect(diagnostics).toEqual([]);

    const { code } = generateStrategies(program!);

    expect(code).toMatch(/^\/\* Generated by @xndrjs\/ziel\/compile\./);
    expect(code).toContain('import { createGraphResolutionStrategy } from "@xndrjs/ziel";');
    expect(code).not.toMatch(/from\s+["']@xndrjs\/ziel\/compile["']/);
    expect(code).toContain("createPostDetailStrategy");
    expect(code).toContain("userAri({ id: predicate.payload.authorId })");
    expect(code).not.toContain(".build()");
  });

  it("emits Entry/CustomReference each strips and armed Entry .when for page-detail", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("page-detail.ziel"));
    expect(diagnostics).toEqual([]);

    const { code } = generateStrategies(program!);

    expect(code).toContain(".on(pageAri)");
    expect(code).toContain(
      "entryAri({ spaceId: predicate.resource.key[0].spaceId, environmentId: predicate.resource.key[0].environmentId, id: predicate.payload.menuId, locale: predicate.resource.key[0].locale })"
    );
    expect(code).toContain(
      "entryAri({ spaceId: predicate.resource.key[0].spaceId, environmentId: predicate.resource.key[0].environmentId, id: predicate.payload.footerId, locale: predicate.resource.key[0].locale })"
    );
    expect(code).toContain(
      "predicate.payload.strips.map((link: any) => entryAri({ spaceId: predicate.resource.key[0].spaceId, environmentId: predicate.resource.key[0].environmentId, id: link.id, locale: predicate.resource.key[0].locale }))"
    );
    expect(code).toContain(
      "predicate.payload.related.map((ref: any) => customReferenceAri({ ref: ref, locale: predicate.resource.key[0].locale }))"
    );
    expect(code).toContain(".on(entryAri)");
    expect(code).toContain('.when((predicate) => predicate.payload.type == "Hero")');
    expect(code).toContain('.when((predicate) => predicate.payload.type == "Tabs")');
    expect(code).toContain(
      "payload.tabs.map((link: any) => entryAri({ spaceId: predicate.resource.key[0].spaceId, environmentId: predicate.resource.key[0].environmentId, id: link.id, locale: predicate.resource.key[0].locale }))"
    );
    expect(code).not.toContain("heroAri");
    expect(code).not.toContain("tabAri");
    expect(code).not.toContain("tabCollectionAri");
    expect(code).not.toContain("editorialModuleAri");
    expect(code).not.toContain(".build()");
    expect(code).toContain("strategy.islands");
    expect(code).toContain(
      '.when((predicate) => (predicate.payload.type == "Menu" || predicate.payload.type == "Footer"))'
    );
    expect(code).toContain(".startIsland()");
  });

  it("emits .resolve.on().when().to() from resolve-only on CustomReference", () => {
    const source = `
      scalar SpaceId on string;
      scalar EnvironmentId on string;
      scalar Locale on string;
      scalar Ref on string;

      resource Entry(spaceId: SpaceId, environmentId: EnvironmentId, id: string, locale: Locale): {
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

      query RefDetail(ref: Ref) {
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
        on Entry e { id title }
        on Asset a { id url }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program!);

    expect(code).toContain("strategy.resolve");
    expect(code).toContain(".on(customReferenceAri)");
    expect(code).toContain('.when((predicate) => predicate.payload.type == "Entry")');
    expect(code).toContain('.when((predicate) => predicate.payload.type == "Asset")');
    expect(code).toContain(
      "entryAri({ spaceId: payload.spaceId, environmentId: payload.environmentId, id: payload.id, locale: payload.locale })"
    );
    expect(code).toContain(
      "assetAri({ spaceId: payload.spaceId, environmentId: payload.environmentId, id: payload.id, locale: payload.locale })"
    );
    expect(code.match(/\.on\(customReferenceAri\)/g)).toHaveLength(2);
    expect(code).not.toContain("strategy.expansion");
    expect(code).not.toContain(".expand(");
    expect(code).not.toContain(".build()");
  });

  it("emits in / not in / ! in strategy when predicates", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale): {
        type: string
        id
        visible: boolean
        logoId: EntryId
      }

      resource Asset(id: EntryId, locale: Locale): {
        id
      }

      query PageDetail(pageId: EntryId) {
        context { locale: Locale }
        root Entry(id: pageId, locale: context.locale)
        on Entry e {
          when e.type in ["Menu", "Footer"] {
            expand logo: Asset(id: e.logoId, locale: context.locale)
          }
          when !e.visible {
            id
          }
          default { }
        }
        islands {
          on Entry e when e.type not in ["Hero"] or !e.visible
        }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics.filter((d) => d.code === "TYPE_MISMATCH")).toEqual([]);

    const code = emitStrategies(program!);

    expect(code).toContain(
      '.when((predicate) => ["Menu", "Footer"].includes(predicate.payload.type))'
    );
    expect(code).toContain(
      '.when((predicate) => (!["Hero"].includes(predicate.payload.type) || !(predicate.payload.visible)))'
    );
  });

  it("omits import when there are no queries", () => {
    const { code } = generateStrategies(emptyProgram());
    expect(code).toBe("/* Generated by @xndrjs/ziel/compile. Do not edit by hand. */\n");
  });
});
