import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { parseAndCheck } from "../parse-and-check";
import { buildResources } from "./build-resources";
import { composeGeneratedModule } from "./compose-generated-module";
import { generateResources } from "./generators/generate-resources";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("buildResources", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function setupRoot(): string {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-naviql-build-"));
    return tempDir;
  }

  it("matches generateResources on a unified program when inputs are split across files", () => {
    const root = setupRoot();
    mkdirSync(join(root, "src"), { recursive: true });

    const scalars = `
scalar PostId on string;
scalar UserId on string;
scalar Locale on string;
`;
    const resources = `
resource Post(id: PostId, locale: Locale): {
  id
  title: string
  content: string
  authorId: UserId
}

resource User(id: UserId): {
  id
  username: string
}
`;

    writeFileSync(join(root, "src", "scalars.naviql"), scalars);
    writeFileSync(join(root, "src", "resources.naviql"), resources);

    const unified = parseAndCheck(`${scalars}\n${resources}`);
    expect(unified.diagnostics).toEqual([]);
    const expected = generateResources(unified.program).code;

    const result = buildResources({ root, include: ["src/**/*.naviql"] });

    expect(result.diagnostics).toEqual([]);
    expect(result.files).toEqual([
      join(root, "src", "resources.naviql"),
      join(root, "src", "scalars.naviql"),
    ]);
    expect(result.code).toBe(expected);
    expect(result.code).toContain("export const postAri");
    expect(result.code).toContain("export type PostId");
  });

  it("allows cross-file scalar references (per-file check is not authoritative)", () => {
    const root = setupRoot();
    writeFileSync(join(root, "a.naviql"), "scalar PostId on string;");
    writeFileSync(join(root, "b.naviql"), "resource Post(id: PostId): { id title: string }");

    const result = buildResources({ root });

    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("export const postAri");
    expect(result.code).toContain("export type PostId");
  });

  it("returns all SYNTAX_ERROR diagnostics and empty code without emitting", () => {
    const root = setupRoot();
    writeFileSync(join(root, "ok.naviql"), "scalar Ok on string;");
    writeFileSync(join(root, "bad.naviql"), "scalar Broken on");
    writeFileSync(join(root, "also-bad.naviql"), "resource X(");

    const result = buildResources({ root });

    expect(result.code).toBe("");
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics.every((d) => d.code === "SYNTAX_ERROR")).toBe(true);
    expect(result.diagnostics.every((d) => d.path?.includes("file:"))).toBe(true);
    expect(result.files).toHaveLength(3);
  });

  it("reports merged semantic diagnostics and does not emit", () => {
    const root = setupRoot();
    writeFileSync(join(root, "a.naviql"), "scalar Id on string;\nresource Thing(id: Id): { id }");
    writeFileSync(join(root, "b.naviql"), "scalar Id on string;\nresource Thing(id: Id): { id }");

    const result = buildResources({ root });

    expect(result.code).toBe("");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_SCALAR" })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_RESOURCE" })
    );
  });

  it("forwards importFrom and registryTypeName to composeGeneratedModule", () => {
    const root = setupRoot();
    writeFileSync(
      join(root, "post.naviql"),
      "scalar PostId on string;\nresource Post(id: PostId): { id title: string }"
    );

    const result = buildResources({
      root,
      importFrom: "@acme/naviql-runtime",
      registryTypeName: "DemoRegistry",
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain('from "@acme/naviql-runtime"');
    expect(result.code).toContain("export type DemoRegistry");
  });

  it("composes resources, strategies, and projections for post-detail", () => {
    const root = setupRoot();
    writeFileSync(join(root, "post-detail.naviql"), loadFixture("post-detail.naviql"));

    const result = buildResources({ root });
    const expected = composeGeneratedModule(
      parseAndCheck(loadFixture("post-detail.naviql")).program
    ).code;

    expect(result.diagnostics).toEqual([]);
    expect(result.code).toBe(expected);
    expect(result.code).toContain("export const postAri");
    expect(result.code).toContain("export function createPostDetailStrategy");
    expect(result.code).toContain("export function projectPostDetail");
    expect(result.code).toContain("export async function resolvePostDetail");
    expect(result.code).toContain("createResourceGraphResolver");
    expect(result.code).toContain(
      'import { ari, s, createGraphResolutionStrategy, type ContentMap, createResourceGraphResolver, type DataSource, type IslandDependencyMap, type IslandMap, type MissingResourceMode, type ResolutionError, type ResolutionObserver, type ResourceKey, type SchedulingMode } from "@xndrjs/naviql";'
    );
    expect(result.code).not.toMatch(/from ["'][^"']*\/compile["']/);
    // Resource-only generateResources still ignores queries.
    expect(
      generateResources(parseAndCheck(loadFixture("post-detail.naviql")).program).code
    ).not.toContain("createPostDetailStrategy");
  });

  it("returns empty emit for no matching files", () => {
    const root = setupRoot();
    writeFileSync(join(root, "notes.txt"), "not naviql");

    const result = buildResources({ root });

    expect(result.files).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.code).toContain("Generated by @xndrjs/naviql/compile");
    expect(result.code).not.toContain("export const");
  });
});
