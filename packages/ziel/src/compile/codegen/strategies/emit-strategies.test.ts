import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  arg,
  construct,
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
          parameters: [field("postId", scalarRef("PostId")), field("locale", scalarRef("Locale"))],
          contextProjections: [{ contextName: "locale", paramName: "locale", span: null }],
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

      query EntryDetail(entryId: EntryId, locale: Locale) {
        context {
    locale
  }
        root Entry(id: entryId, locale: locale)
        on Entry e {
          when e.type == "Hero" {
            id
            title
            expand image: Asset(id: e.imageId, locale: locale)
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
    expect(code).toContain("assetAri({ id: payload.imageId, locale: params.locale })");
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
          parameters: [field("locale", scalarRef("Locale"))],
          contextProjections: [{ contextName: "locale", paramName: "locale", span: null }],
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
                      arg("locale", param("locale")),
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

    expect(code).toContain("export function createPageDetailStrategy(params: PageDetailParams)");
    expect(code).toContain(
      'predicate.payload.strips.filter((s) => s.type == "Hero").map((s) => heroAri({ id: s.id, locale: params.locale }))'
    );
  });

  it("preserves first-match expansion semantics and emits default expansions", () => {
    const source = `
      scalar EntryId on string;

      resource Entry(id: EntryId): {
        id
        kind: "Hero" | "Page"
        title: string
        childId: EntryId
      }
      resource Asset(id: EntryId): { id }

      query Q(id: EntryId) {
        context { }
        root Entry(id: id)
        on Entry e {
          when e.title == "featured" {
            expand featured: Asset(id: e.childId)
          }
          when e.kind == "Hero" {
            expand hero: Asset(id: e.childId)
          }
          default {
            expand fallback: Asset(id: e.childId)
          }
        }
        on Asset a { id }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program);
    expect(code).toContain('.when((predicate) => predicate.payload.title == "featured")');
    expect(code).toContain(
      '.when((predicate) => !(predicate.payload.title == "featured") && (predicate.payload.kind == "Hero"))'
    );
    expect(code).toContain(
      '.when((predicate) => !(predicate.payload.title == "featured") && !(predicate.payload.kind == "Hero"))'
    );
    expect(code.match(/\.on\(entryAri\)/g)).toHaveLength(3);
  });

  it("emits unconditional startIsland for island without when", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Page(id: EntryId, locale: Locale): { id }

      query PageDetail(pageId: EntryId, locale: Locale) {
        context {
    locale
  }
        root Page(id: pageId, locale: locale)
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

      query PageDetail(pageId: EntryId, locale: Locale) {
        context {
    locale
  }
        root Entry(id: pageId, locale: locale)
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
      "entryAri({ spaceId: predicate.resource.key.spaceId, environmentId: predicate.resource.key.environmentId, id: predicate.payload.menuId, locale: predicate.resource.key.locale })"
    );
    expect(code).toContain(
      "entryAri({ spaceId: predicate.resource.key.spaceId, environmentId: predicate.resource.key.environmentId, id: predicate.payload.footerId, locale: predicate.resource.key.locale })"
    );
    expect(code).toContain(
      "predicate.payload.strips.map((pageLink) => entryAri({ spaceId: predicate.resource.key.spaceId, environmentId: predicate.resource.key.environmentId, id: pageLink.id, locale: predicate.resource.key.locale }))"
    );
    expect(code).toContain(
      "predicate.payload.related.map((ref) => customReferenceAri({ ref: ref, locale: predicate.resource.key.locale }))"
    );
    expect(code).toContain(".on(entryAri)");
    expect(code).toContain('.when((predicate) => predicate.payload.type == "Hero")');
    expect(code).toContain(
      '.when((predicate) => !(predicate.payload.type == "Hero") && (predicate.payload.type == "Tabs"))'
    );
    expect(code).toContain(
      "payload.tabs.map((tabLink) => entryAri({ spaceId: predicate.resource.key.spaceId, environmentId: predicate.resource.key.environmentId, id: tabLink.id, locale: predicate.resource.key.locale }))"
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

      query RefDetail(ref: Ref, locale: Locale) {
        context {
    locale
  }
        root CustomReference(ref: ref, locale: locale)
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

      query PageDetail(pageId: EntryId, locale: Locale) {
        context {
    locale
  }
        root Entry(id: pageId, locale: locale)
        on Entry e {
          when e.type in ["Menu", "Footer"] {
            expand logo: Asset(id: e.logoId, locale: locale)
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

  it("expands TabCollection as one ARI with no member fan-out", () => {
    const source = `
      scalar TabId on string;
      scalar TabsId on string;
      scalar Locale on string;

      resource Tab(id: TabId, locale: Locale): { id }
      resource TabCollection(tabsId: TabsId, locale: Locale): Tab[]
      resource Page(id: string, locale: Locale): { id tabsId: TabsId }

      query Q(pageId: string, locale: Locale) {
        context {
    locale
  }
        root Page(id: pageId, locale: locale)
        on Page p {
          id
          expand tabs: TabCollection(tabsId: p.tabsId, locale: locale)
        }
        on TabCollection t { }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program!);

    expect(code).toContain(".on(pageAri)");
    expect(code).toContain(
      "tabCollectionAri({ tabsId: predicate.payload.tabsId, locale: params.locale })"
    );
    // Empty on TabCollection contributes no further expansion policy.
    expect(code).not.toContain(".on(tabCollectionAri)");
    expect(code).not.toContain("tabAri");
    expect(code).not.toMatch(/tabCollectionAri[\s\S]*\.map\(/);
  });

  it("emits expansion-backed each for resolve to each (no .resolve.to)", () => {
    const source = `
      scalar TabsId on string;
      scalar TabId on string;
      scalar Locale on string;

      resource Tab(id: TabId, locale: Locale): { id }
      resource TabCollection(tabsId: TabsId, locale: Locale): {
        tabsIds: { id: TabId }[]
        locale: Locale
      }
      resource Tabs(tabsId: TabsId, locale: Locale): { tabsId: TabsId }

      query Q(tabsId: TabsId, locale: Locale) {
        context {
    locale
  }
        root Tabs(tabsId: tabsId, locale: locale)
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

    const code = emitStrategies(program!);

    expect(code).toContain("strategy.expansion");
    expect(code).toContain(".on(tabCollectionAri)");
    expect(code).toContain(
      "predicate.payload.tabsIds.map((link) => tabAri({ id: link.id, locale: predicate.resource.key.locale }))"
    );
    expect(code).toContain('onFailure: "setNull"');
    expect(code).not.toContain("strategy.resolve");
    expect(code).not.toContain(".to((predicate)");
  });

  it("maps the whole payload when resolve to each reads a raw array resource", () => {
    const source = `
      scalar Id on string;

      resource Item(id: Id): { id }
      resource Batch(id: Id): { id: Id }[]

      query Q(id: Id) {
        context { }
        root Batch(id: id)
        on Batch batch resolve to each item in batch (
          Item(id: item.id)
        )
        on Item itemProjection { id }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program!);

    expect(code).toContain("predicate.payload.map((item) => itemAri({ id: item.id }))");
  });

  it("emits multi-arm flatMap for polymorphic resolve to each", () => {
    const source = `
      scalar CollectionId on string;
      scalar Id on string;
      scalar Locale on string;

      resource Tab(id: Id, locale: Locale): { id }
      resource Strip(id: Id, locale: Locale): { id }
      resource MixedCollection(id: CollectionId, locale: Locale): {
        items: { kind: "Tab" | "Strip", id: Id }[]
      }
      resource Page(id: string, locale: Locale): { id collectionId: CollectionId }

      query Q(pageId: string, locale: Locale) {
        context {
    locale
  }
        root Page(id: pageId, locale: locale)
        on Page p {
          expand items: MixedCollection(id: p.collectionId, locale: @p.locale)
        }
        on MixedCollection c resolve to each item in c.items (
          Tab(id: item.id, locale: @c.locale) when item.kind == "Tab",
          Strip(id: item.id, locale: @c.locale) when item.kind == "Strip"
        )
        on Tab tab { id }
        on Strip s { id }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program!);

    expect(code).toContain(".on(mixedCollectionAri)");
    expect(code).toContain("flatMap((item)");
    expect(code).toContain('item.kind == "Tab"');
    expect(code).toContain('item.kind == "Strip"');
    expect(code).toContain("tabAri({ id: item.id");
    expect(code).toContain("stripAri({ id: item.id");
    expect(code).toContain("return [];");
    expect(code).not.toContain("strategy.resolve");
  });

  // Expected-failure regression: duplicate ARIs inside one generated expansion
  // result must retain the strictest edge policy, independent of source order.
  it.fails("merges duplicate generated ARI policies with strictest-wins", () => {
    const source = `
      scalar Id on string;

      resource Entry(id: Id): { id }
      resource Collection(id: Id): {
        items: { id: Id, mode: "required" | "optional" }[]
      }

      query Q(id: Id) {
        context { }
        root Collection(id: id)
        on Collection collection resolve to each item in collection.items (
          Entry(id: item.id) when item.mode == "required",
          Entry(id: item.id) when item.mode == "optional" on failure set null
        )
        on Entry entry { id }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program!);
    expect(code).toContain("stricterOnFailure");
  });

  it("emits ExpansionResult.onFailure for uniform set-null expands", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale): { id title: string }
      resource Page(id: EntryId, locale: Locale): { id menuId: EntryId footerId: EntryId }

      query PageDetail(pageId: EntryId, locale: Locale) {
        context {
    locale
  }
        root Page(id: pageId, locale: locale)
        on Page p {
          id
          expand menu: Entry(id: p.menuId, locale: @p.locale) on failure set null
          expand footer: Entry(id: p.footerId, locale: @p.locale) on failure set null
        }
        on Entry e { id title }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program!);
    expect(code).toContain('onFailure: "setNull"');
    expect(code).not.toContain("onFailureByKey");
  });

  it("emits onFailureByKey when expand policies disagree", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale): { id title: string }
      resource Page(id: EntryId, locale: Locale): { id menuId: EntryId footerId: EntryId }

      query PageDetail(pageId: EntryId, locale: Locale) {
        context {
    locale
  }
        root Page(id: pageId, locale: locale)
        on Page p {
          id
          expand menu: Entry(id: p.menuId, locale: @p.locale) on failure set null
          expand footer: Entry(id: p.footerId, locale: @p.locale) on failure set error
        }
        on Entry e { id title }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitStrategies(program!);
    expect(code).toContain("onFailureByKey");
    expect(code).toContain('"setNull"');
    expect(code).toContain('"setError"');
  });
});
