import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlopOs, plopAddFlags } from "./runtime.js";

function touchDir(...segments: string[]): string {
  const dir = path.join(...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

describe("plopAddFlags", () => {
  it("maps conflict policies to Plop add flags", () => {
    expect(plopAddFlags("skip")).toEqual({ skipIfExists: true });
    expect(plopAddFlags("overwrite")).toEqual({ force: true });
    expect(plopAddFlags("throw")).toEqual({});
  });
});

describe("createPlopOs", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "plop-os-runtime-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("defaults roots to cwd and ignore to package defaults", () => {
    const plopOs = createPlopOs();
    expect(plopOs.discovery.roots).toEqual([process.cwd()]);
    expect(plopOs.discovery.ignore).toEqual(["node_modules", "dist", ".git", "coverage"]);
  });

  it("registers a Discovery rule and lists Candidates", () => {
    touchDir(root, "packages", "core-orders", "models");
    touchDir(root, "packages", "core-billing", "models");
    touchDir(root, "packages", "other");

    const plopOs = createPlopOs({ roots: [root], ignore: ["node_modules"] });
    plopOs.addDiscoveryRule({
      name: "core-models",
      pattern: "packages/core-:coreName/models",
      label: ({ data }) => data.coreName,
    });

    const hits = plopOs.candidates<{ coreName: string }>("core-models");
    expect(hits.map((c) => c.data.coreName).sort()).toEqual(["billing", "orders"]);
    expect(hits.every((c) => typeof c.path === "string" && c.label.length > 0)).toBe(true);
  });

  it("resolveCandidate and resolveSubdir go through the runtime", () => {
    const models = touchDir(root, "packages", "core-orders", "models");
    touchDir(models, "strips");

    const plopOs = createPlopOs({ roots: [root] });
    plopOs.addDiscoveryRule({
      name: "core-models",
      pattern: "packages/core-:coreName/models",
    });

    const candidate = plopOs.resolveCandidate<{ coreName: string }>("core-models", models);
    expect(candidate.data.coreName).toBe("orders");

    const sub = plopOs.resolveSubdir(candidate, "strips");
    expect(path.resolve(sub)).toBe(path.resolve(models, "strips"));

    expect(() => plopOs.resolveCandidate("core-models", path.join(root, "packages"))).toThrow(
      /not a valid Candidate/
    );
  });

  it("registers a Sync generator and runs a sync pass", async () => {
    const models = touchDir(root, "packages", "core-orders", "models");
    const barrel = path.join(models, "index.ts");
    write(
      barrel,
      ["// plop-os-sync start models-barrel", "old", "// plop-os-sync end models-barrel", ""].join(
        "\n"
      )
    );

    const plopOs = createPlopOs({ roots: [root] });
    plopOs.syncGenerator("models-barrel", (ctx) => {
      expect(ctx.syncId).toBe("models-barrel");
      expect(path.resolve(ctx.filePath)).toBe(path.resolve(barrel));
      expect(typeof ctx.discovery.listCandidates).toBe("function");
      return 'export * from "./orders.model.js";';
    });

    const result = await plopOs.sync({ id: "models-barrel" });
    expect(result.regionsUpdated).toBe(1);
    expect(result.filesWritten.map((f) => path.resolve(f))).toContain(path.resolve(barrel));
    expect(readFileSync(barrel, "utf8")).toContain('export * from "./orders.model.js";');
  });

  it("throws on unknown Discovery rule name", () => {
    const plopOs = createPlopOs({ roots: [root] });
    expect(() => plopOs.candidates("missing")).toThrow(/unknown discovery rule: missing/);
  });
});
