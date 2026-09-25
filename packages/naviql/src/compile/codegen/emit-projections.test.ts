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
} from "../../fixtures";
import type { Program } from "../../ir";
import { parseAndCheck } from "../parse-and-check";
import { emitProjections } from "./emit-projections";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

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

  it("emits union discrimination and collection map for page-detail", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("page-detail.naviql"));
    expect(diagnostics).toEqual([]);

    const code = emitProjections(program!);

    expect(code).toContain("export function projectPageDetail(");
    expect(code).toContain(
      "payload.strips.map((s) => projectNode(editorialModuleAri({ id: s.id, locale: executionContext.locale })))"
    );
    expect(code).toContain('case "EditorialModule":');
    expect(code).toContain('case "Hero":');
    expect(code).toContain('case "Tabs":');
    expect(code).toContain('case "Product":');
    expect(code).toContain("cannot discriminate EditorialModule payload");
    expect(code).toContain(
      "tabCollectionAri({ tabsId: payload.id, locale: executionContext.locale })"
    );
    expect(code).toContain("projectOnTabFromPayload");
    expect(code).toContain("__collectionPayload.map((item: any) => projectOnTabFromPayload(item))");
    expect(code).toContain(
      "shell.menu = projectNode(menuAri({ id: payload.menuId, locale: executionContext.locale }));"
    );
    // No ContentMap lookup for embedded Tab body — FromPayload only.
    expect(code).toMatch(/const projectOnTabFromPayload = \(payload: any\): any => \{/);
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
});
