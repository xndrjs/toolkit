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
  return { scalars: [], resources: [], queries: [], span: null };
}

describe("emitProjections", () => {
  it("returns empty string when there are no queries", () => {
    expect(emitProjections(emptyProgram())).toBe("");
  });

  it("emits projectPostDetail with author alias, memo, and missing → undefined", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("post-detail.naviql"));
    expect(diagnostics).toEqual([]);

    const code = emitProjections(program!);

    expect(code).toContain("export function projectPostDetail(");
    expect(code).toContain("root: ReturnType<typeof postAri>");
    expect(code).toContain("contentMap: ContentMap<ContentRegistry>");
    expect(code).toContain("params: PostDetailParams");
    expect(code).toContain("executionContext: PostDetailExecutionContext");
    expect(code).toContain(": PostDetailResult");
    expect(code).toContain("const memo = new Map<string, object>();");
    expect(code).toContain('const shell: any = { $type: "Post" };');
    expect(code).toContain("memo.set(resource.toString(), shell);");
    expect(code).toContain("shell.author = projectNode(userAri({ id: payload.authorId }));");
    expect(code).toContain("if (memo.has(key)) return memo.get(key);");
    expect(code).toContain("if (payload === undefined) return undefined;");
    expect(code).toContain('case "Post":');
    expect(code).toContain('case "User":');
    expect(code).toContain("return projectNode(root) as PostDetailResult;");
  });

  it("emits alias-keyed project* for multi-root queries", () => {
    const source = `
      scalar PageId on string;
      scalar SessionId on string;

      resource Page(id: PageId): { id title: string }
      resource UserSession(id: SessionId): { id userId: string }

      query Homepage(pageId: PageId, sessionId: SessionId) {
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
    expect(code).toContain("const memo = new Map<string, object>();");
    expect(code).toContain('case "Page":');
    expect(code).toContain('case "UserSession":');
    expect(code).toContain("page: projectNode(roots.page),");
    expect(code).toContain("session: projectNode(roots.session),");
    expect(code).toContain("} as HomepageResult;");
    expect(code).not.toContain("root: ReturnType<typeof");
  });

  it("emits payload.type switch and Entry shells for armed on Entry", () => {
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

    const code = emitProjections(program!);

    expect(code).toContain("const projectOnEntry = (resource: any, payload: any): any => {");
    expect(code).toContain("switch ((payload as any).type) {");
    expect(code).toContain('case "Hero":');
    expect(code).toContain('case "Page":');
    expect(code).toContain('const shell: any = { $type: "Entry" };');
    expect(code).toContain(
      "shell.image = projectNode(assetAri({ id: payload.imageId, locale: args.executionContext.locale }));"
    );
    expect(code).toContain('case "Entry":');
    expect(code).toContain("return projectOnEntry(ari, payload);");
    // No rematerialize-to-Hero ARI cases.
    expect(code).not.toContain('case "Hero":\n        return projectOnHero');
    expect(code).not.toContain("projectOnHero");
  });

  it("emits Entry/CustomReference strips and armed Entry payload switch for page-detail", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("page-detail.naviql"));
    expect(diagnostics).toEqual([]);

    const code = emitProjections(program!);

    expect(code).toContain("export function projectPageDetail(");
    expect(code).toContain(
      "payload.strips.map((link: any) => projectNode(entryAri({ spaceId: resource.key[0].spaceId, environmentId: resource.key[0].environmentId, id: link.id, locale: resource.key[0].locale })))"
    );
    expect(code).toContain(
      "payload.related.map((ref: any) => projectNode(customReferenceAri({ ref: ref, locale: resource.key[0].locale })))"
    );
    expect(code).toContain(
      "payload.tabs.map((link: any) => projectNode(entryAri({ spaceId: resource.key[0].spaceId, environmentId: resource.key[0].environmentId, id: link.id, locale: resource.key[0].locale })))"
    );
    expect(code).toContain("const projectOnEntry = (resource: any, payload: any): any => {");
    expect(code).toContain("switch ((payload as any).type) {");
    expect(code).toContain('case "Hero":');
    expect(code).toContain('case "SiteInternalLink":');
    expect(code).toContain('case "Page":');
    expect(code).toContain('case "Entry":');
    expect(code).toContain('case "CustomReference":');
    expect(code).toContain(
      "shell.menu = projectNode(entryAri({ spaceId: resource.key[0].spaceId, environmentId: resource.key[0].environmentId, id: payload.menuId, locale: resource.key[0].locale }));"
    );
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

    const code = emitProjections(program!);

    expect(code).toContain('case "CustomReference":');
    expect(code).toContain('case "Hero":');
    expect(code).toContain("return projectOnEntry(ari, payload);");
    expect(code).toContain("return projectOnAsset(ari, payload);");
    expect(code).not.toContain("projectOnCustomReference");
    expect(code).toContain("const projectOnEntry = (resource: any, payload: any): any => {");
    expect(code).toContain("const projectOnAsset = (resource: any, payload: any): any => {");
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
      queries: [
        query("PostDetail", {
          parameters: [field("postId", scalarRef("PostId"))],
          context: [],
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
    expect(code).toContain("shell.author = projectNode(userAri({ id: payload.authorId }));");
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
      queries: [
        query("Cycle", {
          parameters: [field("nodeId", scalarRef("NodeId"))],
          context: [],
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
    expect(onNode).toContain("shell.next = projectNode(nodeAri({ id: payload.nextId }));");
  });
});

describe("generateProjections", () => {
  it("wraps projection types + projectors with header + ContentMap import", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("post-detail.naviql"));
    expect(diagnostics).toEqual([]);

    const { code } = generateProjections(program!);

    expect(code).toMatch(/^\/\* Generated by @xndrjs\/naviql\/compile\./);
    expect(code).toContain('import { type ContentMap } from "@xndrjs/naviql";');
    expect(code).not.toMatch(/from\s+["']@xndrjs\/naviql\/compile["']/);
    expect(code).toContain("export type PostDetail_Post");
    expect(code).toContain("export type PostDetailResult");
    expect(code).toContain("export function projectPostDetail(");
    expect(code).toContain("shell.author = projectNode(userAri({ id: payload.authorId }));");
  });

  it("omits import when there are no queries", () => {
    const { code } = generateProjections(emptyProgram());
    expect(code).toBe("/* Generated by @xndrjs/naviql/compile. Do not edit by hand. */\n");
  });
});
