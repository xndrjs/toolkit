import { afterEach, describe, expect, it, vi } from "vitest";

import {
  looksLikeSourceFilePath,
  parseCliArgs,
  resolveCliOptions,
  validateCliOptions,
} from "./args";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseCliArgs", () => {
  it("parses config, out, root, and dry-run", () => {
    expect(
      parseCliArgs([
        "--config",
        "./ziel.config.ts",
        "--out",
        "./generated",
        "--root",
        "./schemas",
        "--dry-run",
      ])
    ).toEqual({
      configPath: "./ziel.config.ts",
      out: "./generated",
      root: "./schemas",
      dryRun: true,
      watch: false,
      help: false,
    });
  });

  it("treats --watch and --dev as watch mode", () => {
    expect(parseCliArgs(["--watch"])).toMatchObject({ watch: true, dryRun: false });
    expect(parseCliArgs(["--dev"])).toMatchObject({ watch: true });
  });
});

describe("resolveCliOptions", () => {
  it("uses config values when CLI args are omitted", () => {
    expect(
      resolveCliOptions(parseCliArgs(["--config", "./ziel.config.ts"]), {
        out: "./generated",
        root: "./schemas",
      })
    ).toMatchObject({
      out: "./generated",
      root: "./schemas",
    });
  });

  it("lets CLI args override config values and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(
      resolveCliOptions(parseCliArgs(["--out", "./cli-out", "--root", "./cli-root"]), {
        out: "./config-out",
        root: "./config-root",
      })
    ).toMatchObject({
      out: "./cli-out",
      root: "./cli-root",
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--out overrides out"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--root overrides root"));
  });
});

describe("looksLikeSourceFilePath", () => {
  it("detects common JS/TS extensions", () => {
    expect(looksLikeSourceFilePath("./generated/resources.ts")).toBe(true);
    expect(looksLikeSourceFilePath("./out.tsx")).toBe(true);
    expect(looksLikeSourceFilePath("./out.mts")).toBe(true);
    expect(looksLikeSourceFilePath("./out.js")).toBe(true);
    expect(looksLikeSourceFilePath("./generated")).toBe(false);
    expect(looksLikeSourceFilePath("./src/generated/")).toBe(false);
  });
});

describe("validateCliOptions", () => {
  it("requires --out unless --dry-run", () => {
    expect(() => validateCliOptions(parseCliArgs([]))).toThrow(/--out is required/);
    expect(() => validateCliOptions(parseCliArgs(["--dry-run"]))).not.toThrow();
  });

  it("rejects --watch with --dry-run", () => {
    expect(() =>
      validateCliOptions(parseCliArgs(["--watch", "--dry-run", "--out", "./generated"]))
    ).toThrow(/cannot be combined with --dry-run/);
  });

  it("rejects --out paths that look like a single source file", () => {
    expect(() =>
      validateCliOptions(parseCliArgs(["--out", "./generated/resources.ts", "--dry-run"]))
    ).toThrow(/must be a directory/);
  });
});
