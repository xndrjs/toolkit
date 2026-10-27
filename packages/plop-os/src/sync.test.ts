import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultIgnore,
  type CandidateData,
  type DiscoveryOptions,
  type DiscoveryRule,
} from "./discovery.js";
import { findRegionsInFile, runSyncPass, type SyncGenerator } from "./sync.js";

function touchDir(...segments: string[]): string {
  const dir = path.join(...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

describe("findRegionsInFile", () => {
  it("parses balanced // and # markers (happy path)", () => {
    const content = [
      "prefix",
      "// plop-os-sync start alpha",
      "body-a",
      "// plop-os-sync end alpha",
      "",
      "# plop-os-sync start beta",
      "body-b",
      "# plop-os-sync end beta",
      "suffix",
    ].join("\n");

    const regions = findRegionsInFile("demo.ts", content);
    expect(regions).toHaveLength(2);
    expect(regions[0]).toMatchObject({
      filePath: "demo.ts",
      syncId: "alpha",
      startLine: 1,
      endLine: 3,
      bodyStart: 2,
      bodyEnd: 3,
    });
    expect(regions[1]).toMatchObject({
      syncId: "beta",
      startLine: 5,
      endLine: 7,
      bodyStart: 6,
      bodyEnd: 7,
    });
  });

  it("throws on nested regions with file:line", () => {
    const content = [
      "// plop-os-sync start outer",
      "// plop-os-sync start inner",
      "// plop-os-sync end inner",
      "// plop-os-sync end outer",
    ].join("\n");

    expect(() => findRegionsInFile("nested.ts", content)).toThrow(
      /nested\.ts:2: nested regions are not allowed/
    );
  });

  it("throws on end without start with file:line", () => {
    const content = "// plop-os-sync end missing\n";
    expect(() => findRegionsInFile("bad.ts", content)).toThrow(
      /bad\.ts:1: end without start for sync id "missing"/
    );
  });

  it("throws on unclosed regions", () => {
    const content = ["// plop-os-sync start open", "still open"].join("\n");
    expect(() => findRegionsInFile("open.ts", content)).toThrow(
      /open\.ts: unclosed region\(s\): open/
    );
  });
});

describe("runSyncPass", () => {
  let root: string;
  let options: DiscoveryOptions;
  let rules: DiscoveryRule<CandidateData>[];

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "plop-os-sync-"));
    options = { roots: [root], ignore: defaultIgnore() };
    rules = [
      {
        name: "models",
        pattern: "packages/core-:coreName/models",
      },
    ];
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("updates a handwritten marked region (happy path)", async () => {
    const models = touchDir(root, "packages", "core-alpha", "models");
    const barrel = path.join(models, "index.ts");
    write(
      barrel,
      [
        "// handwritten barrel",
        "// plop-os-sync start models-barrel",
        "// plop-os-sync end models-barrel",
        "",
      ].join("\n")
    );

    const generators = new Map<string, SyncGenerator>([
      [
        "models-barrel",
        (ctx) => {
          const candidates = ctx.discovery.listCandidates("models");
          expect(candidates).toHaveLength(1);
          expect(ctx.syncId).toBe("models-barrel");
          expect(path.resolve(ctx.filePath)).toBe(path.resolve(barrel));
          return 'export * from "./user.model.js";\n';
        },
      ],
    ]);

    const result = await runSyncPass({
      discovery: options,
      rules,
      generators,
    });

    expect(result.regionsUpdated).toBe(1);
    expect(result.filesWritten).toHaveLength(1);
    expect(readFileSync(barrel, "utf8")).toBe(
      [
        "// handwritten barrel",
        "// plop-os-sync start models-barrel",
        'export * from "./user.model.js";',
        "// plop-os-sync end models-barrel",
        "",
      ].join("\n")
    );
  });

  it("throws before any write when markers are malformed", async () => {
    const file = path.join(root, "broken.ts");
    const original = [
      "// plop-os-sync start a",
      "// plop-os-sync start b",
      "// plop-os-sync end b",
      "// plop-os-sync end a",
    ].join("\n");
    write(file, original);

    const generators = new Map<string, SyncGenerator>([["a", () => "x"]]);

    await expect(runSyncPass({ discovery: options, rules, generators })).rejects.toThrow(
      /nested regions are not allowed/
    );

    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("throws when a selected region has no registered generator", async () => {
    const file = path.join(root, "orphan.ts");
    write(file, ["// plop-os-sync start missing-id", "// plop-os-sync end missing-id"].join("\n"));

    await expect(runSyncPass({ discovery: options, rules, generators: new Map() })).rejects.toThrow(
      /no sync generator registered for id "missing-id"/
    );

    expect(readFileSync(file, "utf8")).toContain("plop-os-sync start missing-id");
  });

  it("leaves files unchanged when a generator throws", async () => {
    const file = path.join(root, "fail.ts");
    const original = [
      "// keep me",
      "// plop-os-sync start boom",
      "old",
      "// plop-os-sync end boom",
    ].join("\n");
    write(file, original);

    const generators = new Map<string, SyncGenerator>([
      [
        "boom",
        () => {
          throw new Error("generator failed");
        },
      ],
    ]);

    await expect(runSyncPass({ discovery: options, rules, generators })).rejects.toThrow(
      /generator failed/
    );

    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("leaves files unchanged when a generator returns a non-string", async () => {
    const file = path.join(root, "bad-return.ts");
    const original = ["// plop-os-sync start bad", "old", "// plop-os-sync end bad"].join("\n");
    write(file, original);

    const generators = new Map<string, SyncGenerator>([["bad", () => 42 as unknown as string]]);

    await expect(runSyncPass({ discovery: options, rules, generators })).rejects.toThrow(
      /sync generator "bad" must return a string/
    );

    expect(readFileSync(file, "utf8")).toBe(original);
  });

  it("replaces multiple regions in one file bottom-up", async () => {
    const file = path.join(root, "multi.ts");
    write(
      file,
      [
        "head",
        "// plop-os-sync start first",
        "OLD_FIRST",
        "// plop-os-sync end first",
        "middle",
        "// plop-os-sync start second",
        "OLD_SECOND",
        "// plop-os-sync end second",
        "tail",
      ].join("\n")
    );

    const generators = new Map<string, SyncGenerator>([
      ["first", () => "NEW_FIRST\nLINE_2"],
      ["second", () => "NEW_SECOND"],
    ]);

    const result = await runSyncPass({ discovery: options, rules, generators });
    expect(result.regionsUpdated).toBe(2);
    expect(readFileSync(file, "utf8")).toBe(
      [
        "head",
        "// plop-os-sync start first",
        "NEW_FIRST",
        "LINE_2",
        "// plop-os-sync end first",
        "middle",
        "// plop-os-sync start second",
        "NEW_SECOND",
        "// plop-os-sync end second",
        "tail",
      ].join("\n")
    );
  });

  it("filters by sync id and preserves other regions", async () => {
    const file = path.join(root, "filter.ts");
    write(
      file,
      [
        "// plop-os-sync start keep",
        "KEEP_OLD",
        "// plop-os-sync end keep",
        "// plop-os-sync start touch",
        "TOUCH_OLD",
        "// plop-os-sync end touch",
      ].join("\n")
    );

    const generators = new Map<string, SyncGenerator>([
      ["keep", () => "SHOULD_NOT_RUN"],
      ["touch", () => "TOUCH_NEW"],
    ]);

    const result = await runSyncPass({
      discovery: options,
      rules,
      generators,
      syncId: "touch",
    });

    expect(result.regionsUpdated).toBe(1);
    expect(readFileSync(file, "utf8")).toContain("KEEP_OLD");
    expect(readFileSync(file, "utf8")).toContain("TOUCH_NEW");
    expect(readFileSync(file, "utf8")).not.toContain("SHOULD_NOT_RUN");
  });

  it("throws when baseDir escapes configured roots", async () => {
    const outside = mkdtempSync(path.join(tmpdir(), "plop-os-sync-outside-"));
    try {
      await expect(
        runSyncPass({
          discovery: options,
          rules,
          generators: new Map(),
          baseDir: outside,
        })
      ).rejects.toThrow(/base directory escapes configured roots/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("narrows the scan perimeter to baseDir", async () => {
    const inScope = path.join(root, "in", "a.ts");
    const outScope = path.join(root, "out", "b.ts");
    write(
      inScope,
      ["// plop-os-sync start scoped", "old", "// plop-os-sync end scoped"].join("\n")
    );
    write(
      outScope,
      ["// plop-os-sync start scoped", "old", "// plop-os-sync end scoped"].join("\n")
    );

    const generators = new Map<string, SyncGenerator>([["scoped", () => "new"]]);

    await runSyncPass({
      discovery: options,
      rules,
      generators,
      baseDir: path.join(root, "in"),
    });

    expect(readFileSync(inScope, "utf8")).toContain("new");
    expect(readFileSync(outScope, "utf8")).toContain("old");
  });

  it("aborts the whole pass with no writes if a later generator fails", async () => {
    const first = path.join(root, "first.ts");
    const second = path.join(root, "second.ts");
    const firstOriginal = ["// plop-os-sync start ok", "OLD", "// plop-os-sync end ok"].join("\n");
    const secondOriginal = ["// plop-os-sync start fail", "OLD", "// plop-os-sync end fail"].join(
      "\n"
    );
    write(first, firstOriginal);
    write(second, secondOriginal);

    const generators = new Map<string, SyncGenerator>([
      ["ok", () => "NEW"],
      [
        "fail",
        () => {
          throw new Error("late failure");
        },
      ],
    ]);

    await expect(runSyncPass({ discovery: options, rules, generators })).rejects.toThrow(
      /late failure/
    );

    expect(readFileSync(first, "utf8")).toBe(firstOriginal);
    expect(readFileSync(second, "utf8")).toBe(secondOriginal);
  });
});
