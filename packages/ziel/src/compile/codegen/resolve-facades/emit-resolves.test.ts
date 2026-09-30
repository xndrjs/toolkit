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
  return { scalars: [], resources: [], fragments: [], datasources: [], queries: [], span: null };
}

describe("emitResolves", () => {
  it("returns empty string when there are no queries", () => {
    expect(emitResolves(emptyProgram())).toBe("");
  });

  it("emits resolve façade for post-detail (builds root from params + context)", () => {
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
    expect(code).toContain("budget?: ResolutionBudgetOptions;");
    expect(code).toContain("observer?: ResolutionObserver;");
    expect(code).not.toContain("root: ReturnType<typeof");
    expect(code).not.toContain("roots: {");
    expect(code).toContain("const root = postAri({");
    expect(code).toContain("createPostDetailStrategy(input.params).build()");
    expect(code).toContain(
      "createResourceGraphResolver<ContentRegistry, PostDetailExecutionContext>"
    );
    expect(code).toContain("budget: input.budget,");
    expect(code).toContain(
      "const postDetail = projectPostDetail(root, contentMap, {\n    params: input.params,\n    executionContext: input.executionContext,\n  });"
    );
    expect(code).toContain("roots: [root],");
    expect(code).toContain("postDetail: PostDetailResult;");
    expect(code).toContain("islandDependencies: IslandDependencyMap;");
  });

  it("builds alias-keyed roots inside resolve* for multi-root queries", () => {
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

    const code = emitResolves(program!);

    expect(code).toContain("export type ResolveHomepageInput");
    expect(code).toContain("export async function resolveHomepage(");
    expect(code).toContain("params: HomepageParams;");
    expect(code).not.toContain("roots: {\n    page: ReturnType<typeof pageAri>;");
    expect(code).toContain("const roots = {");
    expect(code).toContain("page: pageAri({ id: input.params.pageId }),");
    expect(code).toContain("session: userSessionAri({ id: input.params.sessionId }),");
    expect(code).toContain("roots: [roots.page, roots.session],");
    expect(code).toContain(
      "const homepage = projectHomepage(roots, contentMap, {\n    params: input.params,\n  });"
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
    expect(code).toContain("const root = pageAri({");
    expect(code).toContain("const pageDetail = projectPageDetail(");
    expect(code).toContain("pageDetail: PageDetailResult;");
    expect(code).not.toContain("root: ReturnType<typeof pageAri>;");
  });

  it("passes failures map into project* when on failure set null/error is used", () => {
    const source = `
      scalar EntryId on string;
      scalar Locale on string;

      resource Entry(id: EntryId, locale: Locale): { id title: string }
      resource Page(id: EntryId, locale: Locale): { id menuId: EntryId }

      query PageDetail(pageId: EntryId) {
        context { locale: Locale }
        root Page(id: pageId, locale: context.locale)
        on Page p {
          id
          expand menu: Entry(id: p.menuId, locale: @p.locale) on failure set null
        }
        on Entry e { id title }
      }
    `;
    const { program, diagnostics } = parseAndCheck(source);
    expect(diagnostics).toEqual([]);

    const code = emitResolves(program!);
    expect(code).toContain("    failures,\n    promotedResourceKeys,");
    expect(code).not.toContain("const failures = new Map<ResourceKey, ResolutionError>();");
    expect(code).toContain(
      "const pageDetail = projectPageDetail(root, contentMap, {\n    params: input.params,\n    executionContext: input.executionContext,\n    failures,\n  });"
    );
    expect(code).not.toContain("missingResourceMode");
  });
});
