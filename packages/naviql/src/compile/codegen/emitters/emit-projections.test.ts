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
      "shell.image = projectNode(assetAri({ id: payload.imageId, locale: executionContext.locale }));"
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
          root: construct("Post", [arg("id", param("postId"))]),
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
          root: construct("Node", [arg("id", param("nodeId"))]),
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
