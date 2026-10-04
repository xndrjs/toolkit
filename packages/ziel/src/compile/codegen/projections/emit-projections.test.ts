import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  arg,
  construct,
  expand,
  field,
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
import { emitProjections } from "./emit-projections";
import { generateProjections } from "../generators/generate-projections";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function emptyProgram(): Program {
  return {
    scalars: [],
    opaques: [],
    resources: [],
    fragments: [],
    datasources: [],
    queries: [],
    span: null,
  };
}

describe("emitProjections", () => {
  it("returns empty string when there are no queries", () => {
    expect(emitProjections(emptyProgram())).toBe("");
  });

  it("emits projectPostDetail with author alias, memo, and missing → undefined", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("post-detail.ziel"));
    expect(diagnostics).toEqual([]);

    const code = emitProjections(program!);

    expect(code).toContain("export function projectPostDetail(");
    expect(code).toContain("root: ReturnType<typeof postAri>");
    expect(code).toContain("contentMap: ContentMap<ContentRegistry>");
    expect(code).toContain("params: PostDetailParams");
    expect(code).not.toContain("executionContext: PostDetailExecutionContext");
    expect(code).toContain(": PostDetailResult");
    expect(code).toContain("const memo = new Map<string, unknown>();");
    expect(code).toContain(
      "const shell: Partial<PostDetail_Post> = {} satisfies Partial<PostDetail_Post>;"
    );
    expect(code).not.toContain("$type");
    expect(code).toContain("memo.set(resource.toString(), shell);");
    expect(code).toContain(
      'shell.author = projectNode(userAri({ id: payload.authorId })) as PostDetail_Post["author"];'
    );
    expect(code).toContain("if (memo.has(key)) return memo.get(key);");
    expect(code).toContain("if (loadedPayload === undefined) return undefined;");
    expect(code).toContain('case "Post":');
    expect(code).toContain('case "User":');
    expect(code).toContain("return projectNode(root) as PostDetailResult;");
  });

  it("stamps resourceTag on shells when configured", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("post-detail.ziel"));
    expect(diagnostics).toEqual([]);

    const withType = emitProjections(program!, "ContentRegistry", "$type");
    expect(withType).toContain(
      'const shell: Partial<PostDetail_Post> = { $type: "Post" } satisfies Partial<PostDetail_Post>;'
    );
    expect(withType).toContain(
      'const shell: Partial<PostDetail_User> = { $type: "User" } satisfies Partial<PostDetail_User>;'
    );

    const withAlt = emitProjections(program!, "ContentRegistry", "__resource");
    expect(withAlt).toContain(
      'const shell: Partial<PostDetail_Post> = { __resource: "Post" } satisfies Partial<PostDetail_Post>;'
    );
    expect(withAlt).not.toContain("$type");
  });

  it("emits alias-keyed project* for multi-root queries", () => {
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

    const code = emitProjections(program!);

    expect(code).toContain("export function projectHomepage(");
    expect(code).toContain("roots: {\n    page: ReturnType<typeof pageAri>;");
    expect(code).toContain("session: ReturnType<typeof userSessionAri>;");
    expect(code).toContain("contentMap: ContentMap<ContentRegistry>");
    expect(code).toContain("params: HomepageParams");
    expect(code).toContain(": HomepageResult");
    expect(code).toContain("const memo = new Map<string, unknown>();");
    expect(code).toContain('case "Page":');
    expect(code).toContain('case "UserSession":');
    expect(code).toContain("page: projectNode(roots.page),");
    expect(code).toContain("session: projectNode(roots.session),");
    expect(code).toContain("} as HomepageResult;");
    expect(code).not.toContain("root: ReturnType<typeof");
  });

  it("emits ordered if/else ending in default body for armed on Entry", () => {
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

    const code = emitProjections(program!);

    expect(code).toContain(
      "const projectOnEntry = (resource: ReturnType<typeof entryAri>, inputPayload: EntryPayload): EntryDetail_Entry => {"
    );
    expect(code).toContain('if (payload.type == "Hero") {');
    expect(code).toContain('} else if (payload.type == "Page") {');
    expect(code).toContain("} else {");
    expect(code).not.toContain("switch ((payload as any).type)");
    expect(code).toContain("const shell: Partial<EntryDetail_Entry_Hero>");
    expect(code).toContain(
      'shell.image = projectNode(assetAri({ id: payload.imageId, locale: args.params.locale })) as EntryDetail_Entry_Hero["image"];'
    );
    expect(code).toContain('case "Entry":');
    expect(code).toContain(
      "return projectOnEntry(ari as ReturnType<typeof entryAri>, loadedPayload as EntryPayload);"
    );
    // No rematerialize-to-Hero ARI cases.
    expect(code).not.toContain('case "Hero":\n        return projectOnHero');
    expect(code).not.toContain("projectOnHero");
    // A statically exhaustive default has type never and is an invariant failure at runtime.
    const onEntry = code.slice(
      code.indexOf("const projectOnEntry"),
      code.indexOf("const projectOnAsset")
    );
    expect(onEntry).toContain(
      'throw new Error("projectEntryDetail: exhaustive projection default reached for Entry")'
    );
  });

  it("emits Entry/CustomReference strips and armed Entry if/else for page-detail", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("page-detail.ziel"));
    expect(diagnostics).toEqual([]);

    const code = emitProjections(program!);

    expect(code).toContain("export function projectPageDetail(");
    expect(code).toContain(
      "payload.strips.map((pageLink) => projectNode(entryAri({ spaceId: resource.key.spaceId, environmentId: resource.key.environmentId, id: pageLink.id, locale: resource.key.locale })))"
    );
    expect(code).toContain(
      "payload.related.map((ref) => projectNode(customReferenceAri({ ref: ref, locale: resource.key.locale })))"
    );
    expect(code).toContain(
      "payload.tabs.map((tabLink) => projectNode(entryAri({ spaceId: resource.key.spaceId, environmentId: resource.key.environmentId, id: tabLink.id, locale: resource.key.locale })))"
    );
    expect(code).toContain(
      "const projectOnEntry = (resource: ReturnType<typeof entryAri>, inputPayload: EntryPayload): PageDetail_Entry => {"
    );
    expect(code).toContain('if (payload.type == "Hero") {');
    expect(code).toContain('} else if (payload.type == "SiteInternalLink") {');
    expect(code).toContain("} else {");
    expect(code).not.toContain("switch ((payload as any).type)");
    expect(code).toContain('case "Entry":');
    expect(code).toContain('case "CustomReference":');
    expect(code).toContain("const canonical = args.redirects.get(ari.toString());");
    expect(code).toContain("return projectNode(canonical);");
    expect(code).toContain(
      'shell.menu = projectNode(entryAri({ spaceId: resource.key.spaceId, environmentId: resource.key.environmentId, id: payload.menuId, locale: resource.key.locale })) as PageDetail_Page["menu"];'
    );
    expect(code).toContain("redirects: ReadonlyMap<ResourceKey, AddressableResourceIdentifier>;");
    expect(code).not.toContain("editorialModuleAri");
    expect(code).not.toContain("tabCollectionAri");
    expect(code).not.toContain("projectOnHero");
    expect(code).not.toContain("projectOnTabs");
  });

  it("strips resolve-only CustomReference via settle targets (no projectOnCustomReference)", () => {
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

      query PageDetail(pageId: string, locale: Locale) {
        context {
    locale
  }
        root Page(id: pageId, locale: locale)
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

    const code = emitProjections(program!);

    expect(code).toContain('case "CustomReference":');
    expect(code).toContain("const canonical = args.redirects.get(ari.toString());");
    expect(code).toContain("return projectNode(canonical);");
    expect(code).not.toContain("projectOnCustomReference");
    expect(code).toContain(
      "const projectOnEntry = (resource: ReturnType<typeof entryAri>, inputPayload: EntryPayload): PageDetail_Entry => {"
    );
    expect(code).toContain(
      "const projectOnAsset = (resource: ReturnType<typeof assetAri>, inputPayload: AssetPayload): PageDetail_Asset => {"
    );
  });

  it("projects identity-edge ARIs via emitConstruction (payload vs identity)", () => {
    const program: Program = {
      ...emptyProgram(),
      resources: [
        resource("Post", [field("id", scalarRef("PostId"))], {
          kind: "object",
          fields: [field("authorId", scalarRef("UserId"))],
          span: null,
        }),
        resource("User", [field("id", scalarRef("UserId"))], {
          kind: "object",
          fields: [field("username", { kind: "primitive", name: "string", span: null })],
          span: null,
        }),
      ],
      fragments: [],
      datasources: [],
      queries: [
        query("PostDetail", {
          parameters: [field("postId", scalarRef("PostId"))],
          contextProjections: [],
          roots: singleRoot(construct("Post", [arg("id", param("postId"))])),
          projections: [
            projection(
              "Post",
              "p",
              ["id"],
              [expand("author", construct("User", [arg("id", payload("p", "authorId"))]))]
            ),
            projection("User", "u", ["id", "username"]),
          ],
        }),
      ],
    };

    const code = emitProjections(program);

    expect(code).toContain("args: {\n    params: PostDetailParams;\n  }");
    expect(code).not.toContain("executionContext");
    expect(code).toContain(
      'shell.author = projectNode(userAri({ id: payload.authorId })) as PostDetail_Post["author"];'
    );
    expect(code).toContain("shell.username = payload.username;");
  });

  it("memoizes shell before walking edges (cycle-safe early return)", () => {
    const program: Program = {
      ...emptyProgram(),
      resources: [
        resource("Node", [field("id", scalarRef("NodeId"))], {
          kind: "object",
          fields: [field("nextId", scalarRef("NodeId"))],
          span: null,
        }),
      ],
      fragments: [],
      datasources: [],
      queries: [
        query("Cycle", {
          parameters: [field("nodeId", scalarRef("NodeId"))],
          contextProjections: [],
          roots: singleRoot(construct("Node", [arg("id", param("nodeId"))])),
          projections: [
            projection(
              "Node",
              "n",
              ["id"],
              [expand("next", construct("Node", [arg("id", payload("n", "nextId"))]))]
            ),
          ],
        }),
      ],
    };

    const code = emitProjections(program);
    const onNode = code.slice(
      code.indexOf("const projectOnNode"),
      code.indexOf("const projectNode")
    );

    expect(code).toContain("if (memo.has(key)) return memo.get(key);");
    expect(onNode.indexOf("memo.set(resource.toString(), shell);")).toBeLessThan(
      onNode.indexOf("shell.next = projectNode(")
    );
    expect(onNode).toContain(
      'shell.next = projectNode(nodeAri({ id: payload.nextId })) as Cycle_Node["next"];'
    );
  });
});

describe("generateProjections", () => {
  it("wraps projection types + projectors with header + ContentMap import", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("post-detail.ziel"));
    expect(diagnostics).toEqual([]);

    const { code } = generateProjections(program!);

    expect(code).toMatch(/^\/\* Generated by @xndrjs\/ziel\/compile\./);
    expect(code).toContain(
      'import { type ContentMap, type AddressableResourceIdentifier } from "@xndrjs/ziel";'
    );
    expect(code).not.toMatch(/from\s+["']@xndrjs\/ziel\/compile["']/);
    expect(code).toContain("export type PostDetail_Post");
    expect(code).toContain("export type PostDetailResult");
    expect(code).toContain("export function projectPostDetail(");
    expect(code).toContain(
      'shell.author = projectNode(userAri({ id: payload.authorId })) as PostDetail_Post["author"];'
    );
  });

  it("omits import when there are no queries", () => {
    const { code } = generateProjections(emptyProgram());
    expect(code).toBe("/* Generated by @xndrjs/ziel/compile. Do not edit by hand. */\n");
  });

  it("emits projectEdge + failures arg for on failure set null", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale): { id title: string }
      resource Page(id: EntryId, locale: Locale): { id menuId: EntryId }

      query PageDetail(pageId: EntryId, locale: Locale) {
        context {
    locale
  }
        root Page(id: pageId, locale: locale)
        on Page p {
          id
          expand menu: Entry(id: p.menuId, locale: @p.locale) on failure set null
        }
        on Entry e { id title }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitProjections(program!);
    expect(code).toContain("failures: ReadonlyMap<ResourceKey, ResolutionError>");
    expect(code).toContain("const failures = args.failures;");
    expect(code).toContain("shell.menu = projectEdge(");
    expect(code).toContain('"setNull"');
    expect(code).toContain("const projectEdge = (");
  });

  it("projects set-error failures as serializable values and enforces the failure invariant", () => {
    const source = `
      scalar EntryId on string;

      resource Entry(id: EntryId): { id title: string }
      resource Page(id: EntryId): { menuId: EntryId }

      query PageDetail(pageId: EntryId) {
        context { }
        root Page(id: pageId)
        on Page p {
          expand menu: Entry(id: p.menuId) on failure set error
        }
        on Entry e { id title }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const { code } = generateProjections(program!);
    expect(code).toContain("type ResolutionErrorData");
    expect(code).toContain("toResolutionErrorData");
    expect(code).toContain("const failure = failures.get(ari.toString());");
    expect(code).toContain("if (failure === undefined)");
    expect(code).toContain("return toResolutionErrorData(failure);");
    expect(code).not.toContain("return failures.get(ari.toString());");
  });

  it("returns collection payload as-is for empty on TabCollection", () => {
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

    const code = emitProjections(program!);
    expect(code).toContain("const memo = new Map<string, unknown>();");
    expect(code).toContain("shell.tabs = projectNode(tabCollectionAri(");
    expect(code).not.toContain("__collectionPayload");
    expect(code).not.toContain("elementAri");
    expect(code).not.toMatch(/payload\.map\(\([^)]*\)\s*=>\s*tabAri/);
    const onCollection = code.slice(
      code.indexOf("const projectOnTabCollection"),
      code.indexOf("const projectNode")
    );
    expect(onCollection).toContain("memo.set(resource.toString(), inputPayload);");
    expect(onCollection).toContain("return inputPayload;");
    expect(onCollection).not.toContain("const shell");
  });

  it("maps resolve-to-each TabCollection via projectNode case (no redirects)", () => {
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

    const code = emitProjections(program!);
    expect(code).toContain('case "TabCollection": {');
    expect(code).toContain("const resource = ari as ReturnType<typeof tabCollectionAri>;");
    expect(code).toContain("const payload = loadedPayload as TabCollectionPayload;");
    expect(code).toContain(
      'payload.tabsIds.map((link) => projectEdge(tabAri({ id: link.id, locale: resource.key.locale }), "setNull"))'
    );
    expect(code).toContain("shell.tabs = projectNode(tabCollectionAri(");
    expect(code).toContain(
      "shell.strips = payload.stripsIds.map((id) => projectNode(stripAri({ id: id, locale: resource.key.locale })))"
    );
    expect(code).toContain("failures: ReadonlyMap<ResourceKey, ResolutionError>");
    expect(code).toContain("const projectEdge = (");
    expect(code).not.toContain("projectOnTabCollection");
    expect(code).not.toContain("args.redirects");
    expect(code).not.toContain('case "TabCollection": {\n        const canonical');
  });

  it("projects resolve to each from the whole raw array payload", () => {
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

    const code = emitProjections(program!);

    expect(code).toContain("payload.map((item) => projectNode(itemAri({ id: item.id })))");
  });

  it("maps polymorphic resolve-to-each via flatMap in projectNode", () => {
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
        on Tab t { id }
        on Strip s { id }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitProjections(program!);
    expect(code).toContain('case "MixedCollection": {');
    expect(code).toContain("payload.items.flatMap((item) => {");
    expect(code).toContain('if (item.kind == "Tab") return [projectNode(tabAri(');
    expect(code).toContain('if (item.kind == "Strip") return [projectNode(stripAri(');
    expect(code).not.toContain("projectOnMixedCollection");
    expect(code).not.toContain("args.redirects");
  });
});
