import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCliArgs, resolveCliOptions, validateCliOptions } from "./args";

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
        "./out.ts",
        "--root",
        "./schemas",
        "--dry-run",
      ])
    ).toEqual({
      configPath: "./ziel.config.ts",
      out: "./out.ts",
      root: "./schemas",
      dryRun: true,
      help: false,
    });
  });
});

describe("resolveCliOptions", () => {
  it("uses config values when CLI args are omitted", () => {
    expect(
      resolveCliOptions(parseCliArgs(["--config", "./ziel.config.ts"]), {
        out: "./generated.ts",
        root: "./schemas",
      })
    ).toMatchObject({
      out: "./generated.ts",
      root: "./schemas",
    });
  });

  it("lets CLI args override config values and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(
      resolveCliOptions(parseCliArgs(["--out", "./cli.ts", "--root", "./cli-root"]), {
        out: "./config.ts",
        root: "./config-root",
      })
    ).toMatchObject({
      out: "./cli.ts",
      root: "./cli-root",
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--out overrides out"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--root overrides root"));
  });
});

describe("validateCliOptions", () => {
  it("requires --out unless --dry-run", () => {
    expect(() => validateCliOptions(parseCliArgs([]))).toThrow(/--out is required/);
    expect(() => validateCliOptions(parseCliArgs(["--dry-run"]))).not.toThrow();
  });
});
