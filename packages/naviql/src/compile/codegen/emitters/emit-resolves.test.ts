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
    const { program, diagnostics } = parseAndCheck(loadFixture("post-detail.naviql"));
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
    expect(code).toContain("postDetail: PostDetailResult;");
    expect(code).toContain("islandDependencies: IslandDependencyMap;");
  });

  it("emits resolvePageDetail for page-detail fixture", () => {
    const { program, diagnostics } = parseAndCheck(loadFixture("page-detail.naviql"));
    expect(diagnostics).toEqual([]);

    const code = emitResolves(program!);

    expect(code).toContain("export async function resolvePageDetail(");
    expect(code).toContain("createPageDetailStrategy(input.params).build()");
    expect(code).toContain("const pageDetail = projectPageDetail(");
    expect(code).toContain("pageDetail: PageDetailResult;");
  });
});
