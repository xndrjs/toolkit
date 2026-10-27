import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultIgnore,
  listCandidates,
  resolveCandidate,
  resolveSubdir,
  type DiscoveryOptions,
  type DiscoveryRule,
} from "./discovery.js";

function touchDir(...segments: string[]): string {
  const dir = path.join(...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("discovery", () => {
  let root: string;
  let options: DiscoveryOptions;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "plop-os-discovery-"));
    options = { roots: [root], ignore: defaultIgnore() };
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("binds path-to-regexp patterns into Candidate.data", () => {
    touchDir(root, "packages", "core-alpha", "models");
    touchDir(root, "packages", "core-beta", "models");
    touchDir(root, "packages", "core-alpha", "other");

    const rule: DiscoveryRule = {
      name: "models",
      pattern: "packages/core-:coreName/models",
    };

    const candidates = listCandidates(options, rule).sort((a, b) =>
      a.data.coreName!.localeCompare(b.data.coreName!)
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      label: "alpha",
      data: { coreName: "alpha" },
    });
    expect(path.resolve(candidates[0]!.path)).toBe(
      path.resolve(root, "packages/core-alpha/models")
    );
    expect(candidates[1]).toMatchObject({
      label: "beta",
      data: { coreName: "beta" },
    });
  });

  it("binds RegExp named groups as an escape hatch", () => {
    touchDir(root, "apps", "forma-demo", "src");

    const rule: DiscoveryRule = {
      name: "apps",
      pattern: /^apps\/(?<appName>[^/]+)\/src$/,
      label: ({ data }) => `app:${data.appName}`,
    };

    const candidates = listCandidates(options, rule);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      label: "app:forma-demo",
      data: { appName: "forma-demo" },
    });
  });

  it("binds via custom extract escape hatch", () => {
    touchDir(root, "libs", "shared");
    touchDir(root, "libs", "skip-me");

    const rule: DiscoveryRule = {
      name: "libs",
      extract: (relPath) => {
        const match = /^libs\/(?<name>[^/]+)$/.exec(relPath);
        if (!match?.groups?.name || match.groups.name === "skip-me") return false;
        return { name: match.groups.name };
      },
    };

    const candidates = listCandidates(options, rule);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      data: { name: "shared" },
      label: "shared",
    });
  });

  it("honors segment-based ignore (node_modules, dist, .git, …)", () => {
    touchDir(root, "packages", "core-ok", "models");
    touchDir(root, "packages", "core-ok", "node_modules", "hidden", "models");
    touchDir(root, "dist", "packages", "core-gone", "models");
    touchDir(root, ".git", "packages", "core-gone", "models");
    writeFileSync(path.join(touchDir(root, "packages", "core-ok", "models"), ".keep"), "");

    const rule: DiscoveryRule = {
      name: "models",
      pattern: "packages/core-:coreName/models",
    };

    const candidates = listCandidates(options, rule);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.data).toEqual({ coreName: "ok" });
  });

  it("throws when baseDir escapes configured roots", () => {
    const outside = mkdtempSync(path.join(tmpdir(), "plop-os-outside-"));
    try {
      const rule: DiscoveryRule = {
        name: "models",
        pattern: "packages/core-:coreName/models",
      };
      expect(() => listCandidates(options, rule, outside)).toThrow(
        /base directory escapes configured roots/
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("narrows listing to a baseDir inside roots", () => {
    touchDir(root, "packages", "core-alpha", "models");
    touchDir(root, "packages", "core-beta", "models");
    const base = touchDir(root, "packages", "core-alpha");

    const rule: DiscoveryRule = {
      name: "models",
      pattern: "models",
    };

    const candidates = listCandidates(options, rule, base);
    expect(candidates).toHaveLength(1);
    expect(path.resolve(candidates[0]!.path)).toBe(
      path.resolve(root, "packages/core-alpha/models")
    );
  });

  it("resolveCandidate accepts a listed path and rejects non-Candidates", () => {
    const models = touchDir(root, "packages", "core-alpha", "models");
    touchDir(root, "packages", "core-alpha", "src");

    const rule: DiscoveryRule = {
      name: "models",
      pattern: "packages/core-:coreName/models",
    };

    const hit = resolveCandidate(options, rule, models);
    expect(hit.data).toEqual({ coreName: "alpha" });

    expect(() =>
      resolveCandidate(options, rule, path.join(root, "packages/core-alpha/src"))
    ).toThrow(/path is not a valid Candidate/);
  });

  it("resolveSubdir allows nested relative paths and rejects escape / absolute", () => {
    const models = touchDir(root, "packages", "core-alpha", "models");
    const candidate = resolveCandidate(
      options,
      { name: "models", pattern: "packages/core-:coreName/models" },
      models
    );

    const nested = resolveSubdir(candidate, "domain/user");
    expect(path.resolve(nested)).toBe(path.resolve(models, "domain/user"));

    expect(() => resolveSubdir(candidate, "../escape")).toThrow(
      /subdirectory escapes candidate path/
    );
    expect(() => resolveSubdir(candidate, path.resolve(root, "other"))).toThrow(
      /subdirectory must be relative/
    );
  });

  it("applies optional filter and label mappers", () => {
    touchDir(root, "packages", "core-keep", "models");
    touchDir(root, "packages", "core-drop", "models");

    const rule: DiscoveryRule = {
      name: "models",
      pattern: "packages/core-:coreName/models",
      filter: ({ data }) => data.coreName !== "drop",
      label: ({ data }) => `core/${data.coreName}`,
    };

    const candidates = listCandidates(options, rule);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.label).toBe("core/keep");
  });
});
