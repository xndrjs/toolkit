import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { parseAndCheck } from "../parse-and-check";
import { buildGeneratedModule, buildResources } from "./build-generated-module";
import { composeGeneratedModules } from "./compose-generated-module";
import { generateResources } from "./generators/generate-resources";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

function fileMap(files: { relativePath: string; code: string }[]): Map<string, string> {
  return new Map(files.map((f) => [f.relativePath, f.code]));
}

describe("buildGeneratedModule", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function setupRoot(): string {
    tempDir = mkdtempSync(join(tmpdir(), "xndrjs-ziel-build-"));
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

    writeFileSync(join(root, "src", "scalars.ziel"), scalars);
    writeFileSync(join(root, "src", "resources.ziel"), resources);

    const unified = parseAndCheck(`${scalars}\n${resources}`);
    expect(unified.diagnostics).toEqual([]);
    const expected = generateResources(unified.program).code;

    const result = buildGeneratedModule({ root, include: ["src/**/*.ziel"] });

    expect(result.diagnostics).toEqual([]);
    expect(result.sourceFiles).toEqual([
      join(root, "src", "resources.ziel"),
      join(root, "src", "scalars.ziel"),
    ]);
    expect(result.files.map((f) => f.relativePath)).toEqual(["resources.ts", "index.ts"]);
    expect(fileMap(result.files).get("resources.ts")).toBe(expected);
    expect(fileMap(result.files).get("resources.ts")).toContain("export const postAri");
    expect(fileMap(result.files).get("resources.ts")).toContain("export type PostId");
  });

  it("allows cross-file scalar references (per-file check is not authoritative)", () => {
    const root = setupRoot();
    writeFileSync(join(root, "a.ziel"), "scalar PostId on string;");
    writeFileSync(join(root, "b.ziel"), "resource Post(id: PostId): { id title: string }");

    const result = buildGeneratedModule({ root });
    const resources = fileMap(result.files).get("resources.ts")!;

    expect(result.diagnostics).toEqual([]);
    expect(resources).toContain("export const postAri");
    expect(resources).toContain("export type PostId");
  });

  it("resolves resource payloads and fragment spreads across files", () => {
    const root = setupRoot();
    writeFileSync(
      join(root, "a-resources.ziel"),
      `
        scalar Id on string;
        resource Entry(id: Id): { id title: string }
        resource EntryCollection(id: Id): Entry[]
      `
    );
    writeFileSync(
      join(root, "b-fragment.ziel"),
      `fragment EntrySummary on Entry entry { id title }`
    );
    writeFileSync(
      join(root, "c-query.ziel"),
      `
        query EntryDetail(id: Id) {
          context { }
          root Entry(id: id)
          on Entry entry { ...EntrySummary }
        }
      `
    );

    const result = buildGeneratedModule({ root });
    const byPath = fileMap(result.files);

    expect(result.diagnostics).toEqual([]);
    expect(byPath.get("resources.ts")).toContain(
      "export type EntryCollectionPayload = EntryPayload[];"
    );
    expect(byPath.get("entry-detail.query.ts")).toContain("export type EntryDetail_Entry = {");
    expect(byPath.get("entry-detail.query.ts")).toContain("title: string;");
  });

  it("returns all SYNTAX_ERROR diagnostics and empty files without emitting", () => {
    const root = setupRoot();
    writeFileSync(join(root, "ok.ziel"), "scalar Ok on string;");
    writeFileSync(join(root, "bad.ziel"), "scalar Broken on");
    writeFileSync(join(root, "also-bad.ziel"), "resource X(");

    const result = buildGeneratedModule({ root });

    expect(result.files).toEqual([]);
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(2);
    expect(result.diagnostics.every((d) => d.code === "SYNTAX_ERROR")).toBe(true);
    expect(result.diagnostics.every((d) => d.path?.includes("file:"))).toBe(true);
    expect(result.sourceFiles).toHaveLength(3);
  });

  it("reports merged semantic diagnostics and does not emit", () => {
    const root = setupRoot();
    writeFileSync(join(root, "a.ziel"), "scalar Id on string;\nresource Thing(id: Id): { id }");
    writeFileSync(join(root, "b.ziel"), "scalar Id on string;\nresource Thing(id: Id): { id }");

    const result = buildGeneratedModule({ root });

    expect(result.files).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_SCALAR" })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "DUPLICATE_RESOURCE" })
    );
  });

  it("forwards importFrom and registryTypeName to composeGeneratedModules", () => {
    const root = setupRoot();
    writeFileSync(
      join(root, "post.ziel"),
      "scalar PostId on string;\nresource Post(id: PostId): { id title: string }"
    );

    const result = buildGeneratedModule({
      root,
      importFrom: "@acme/ziel-runtime",
      registryTypeName: "DemoRegistry",
    });
    const resources = fileMap(result.files).get("resources.ts")!;

    expect(result.diagnostics).toEqual([]);
    expect(resources).toContain('from "@acme/ziel-runtime"');
    expect(resources).toContain("export type DemoRegistry");
  });

  it("composes resources, strategies, and projections for post-detail", () => {
    const root = setupRoot();
    writeFileSync(join(root, "post-detail.ziel"), loadFixture("post-detail.ziel"));

    const result = buildGeneratedModule({ root });
    const expected = composeGeneratedModules(
      parseAndCheck(loadFixture("post-detail.ziel")).program
    ).files;
    const byPath = fileMap(result.files);

    expect(result.diagnostics).toEqual([]);
    expect(result.files.map((f) => f.relativePath)).toEqual(expected.map((f) => f.relativePath));
    expect(result.files.map((f) => f.code)).toEqual(expected.map((f) => f.code));
    expect(byPath.get("resources.ts")).toContain("export const postAri");
    expect(byPath.get("post-detail.query.ts")).toContain(
      "export function createPostDetailStrategy"
    );
    expect(byPath.get("post-detail.query.ts")).toContain("export function projectPostDetail");
    expect(byPath.get("post-detail.query.ts")).toContain("export async function resolvePostDetail");
    expect(byPath.get("post-detail.query.ts")).toContain("createResourceGraphResolver");
    expect(byPath.get("post-detail.query.ts")).toMatch(
      /import \{[^}]*createGraphResolutionStrategy[^}]*\} from "@xndrjs\/ziel"/
    );
    expect(byPath.get("post-detail.query.ts")).not.toMatch(/from ["'][^"']*\/compile["']/);
    // Resource-only generateResources still ignores queries.
    expect(
      generateResources(parseAndCheck(loadFixture("post-detail.ziel")).program).code
    ).not.toContain("createPostDetailStrategy");
  });

  it("returns empty-resources emit for no matching files", () => {
    const root = setupRoot();
    writeFileSync(join(root, "notes.txt"), "not ziel");

    const result = buildGeneratedModule({ root });
    const byPath = fileMap(result.files);

    expect(result.sourceFiles).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.files.map((f) => f.relativePath)).toEqual(["resources.ts", "index.ts"]);
    expect(byPath.get("resources.ts")).toContain("Generated by @xndrjs/ziel/compile");
    expect(byPath.get("resources.ts")).not.toContain("export const");
  });

  it("keeps buildResources as a deprecated alias", () => {
    expect(buildResources).toBe(buildGeneratedModule);
  });
});
