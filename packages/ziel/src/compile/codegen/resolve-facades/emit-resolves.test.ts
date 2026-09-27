import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Program } from "../../../ir";
import { parseAndCheck } from "../../parse-and-check";
import { emitResolves } from "./emit-resolves";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function emptyProgram(): Program {
  return { scalars: [], resources: [], queries: [], span: null };
}

describe("emitResolves", () => {
  it("returns empty string when there are no queries", () => {
    expect(emitResolves(emptyProgram())).toBe("");
  });

  it("emits resolve façade for post-detail (closed strategy + project)", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("post-detail.ziel"));
    expect(diagnostics).toEqual([]);

    const code = emitResolves(program!);

    expect(code).toContain("export type ResolvePostDetailInput");
    expect(code).toContain("export type ResolvePostDetailResult");
    expect(code).toContain("export async function resolvePostDetail(");
    expect(code).toContain("params: PostDetailParams;");
    expect(code).toContain(
      "sources: readonly DataSource<ContentRegistry, PostDetailExecutionContext>[]"
    );
    expect(code).toContain("schedulingMode?: SchedulingMode;");
    expect(code).toContain("observer?: ResolutionObserver;");
    expect(code).toContain("createPostDetailStrategy(input.params).build()");
    expect(code).toContain(
      "createResourceGraphResolver<ContentRegistry, PostDetailExecutionContext>"
    );
    expect(code).toContain(
      "const postDetail = projectPostDetail(input.root, contentMap, {\n    params: input.params,\n    executionContext: input.executionContext,\n  });"
    );
    expect(code).toContain("roots: [input.root],");
    expect(code).toContain("root: ReturnType<typeof postAri>;");
    expect(code).toContain("postDetail: PostDetailResult;");
    expect(code).toContain("islandDependencies: IslandDependencyMap;");
  });

  it("emits alias-keyed resolve* façade for multi-root queries", () => {
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

    const code = emitResolves(program!);

    expect(code).toContain("export type ResolveHomepageInput");
    expect(code).toContain("export async function resolveHomepage(");
    expect(code).toContain("params: HomepageParams;");
    expect(code).toContain("roots: {\n    page: ReturnType<typeof pageAri>;");
    expect(code).toContain("session: ReturnType<typeof userSessionAri>;");
    expect(code).toContain("roots: [input.roots.page, input.roots.session],");
    expect(code).toContain(
      "const homepage = projectHomepage(input.roots, contentMap, {\n    params: input.params,\n  });"
    );
    expect(code).toContain("homepage: HomepageResult;");
    expect(code).not.toContain("root: ReturnType<typeof");
  });

  it("emits resolvePageDetail for page-detail fixture", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("page-detail.ziel"));
    expect(diagnostics).toEqual([]);

    const code = emitResolves(program!);

    expect(code).toContain("export async function resolvePageDetail(");
    expect(code).toContain("createPageDetailStrategy(input.params).build()");
    expect(code).toContain("const pageDetail = projectPageDetail(");
    expect(code).toContain("pageDetail: PageDetailResult;");
  });
});
