import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseCliArgs,
  requireLocalesSnapshot,
  resolveCliOptions,
  validateCliOptions,
} from "./args";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseCliArgs", () => {
  it("parses snapshot and from-snapshot flags", () => {
    expect(
      parseCliArgs([
        "--from-snapshot",
        "--snapshot",
        "./types.json",
        "--snapshot-locales",
        "./locales.json",
        "--out",
        "./out.ts",
      ])
    ).toMatchObject({
      fromSnapshot: true,
      snapshot: "./types.json",
      snapshotLocales: "./locales.json",
      out: "./out.ts",
    });
  });

  it("parses comma-separated content types", () => {
    expect(parseCliArgs(["--content-types", "blogPost, page", "--out", "x.ts"])).toMatchObject({
      contentTypeIds: ["blogPost", "page"],
    });
  });

  it("does not read credentials from fixed environment variable names", () => {
    const prev = {
      space: process.env.CONTENTFUL_SPACE_ID,
      token: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
      environment: process.env.CONTENTFUL_ENVIRONMENT,
    };

    try {
      process.env.CONTENTFUL_SPACE_ID = "space-env";
      process.env.CONTENTFUL_MANAGEMENT_TOKEN = "token-env";
      process.env.CONTENTFUL_ENVIRONMENT = "staging";

      expect(parseCliArgs([])).toMatchObject({
        spaceId: undefined,
        managementToken: undefined,
        environmentId: undefined,
      });
    } finally {
      if (prev.space === undefined) {
        delete process.env.CONTENTFUL_SPACE_ID;
      } else {
        process.env.CONTENTFUL_SPACE_ID = prev.space;
      }

      if (prev.token === undefined) {
        delete process.env.CONTENTFUL_MANAGEMENT_TOKEN;
      } else {
        process.env.CONTENTFUL_MANAGEMENT_TOKEN = prev.token;
      }

      if (prev.environment === undefined) {
        delete process.env.CONTENTFUL_ENVIRONMENT;
      } else {
        process.env.CONTENTFUL_ENVIRONMENT = prev.environment;
      }
    }
  });
});

describe("resolveCliOptions", () => {
  it("uses config values when CLI args are omitted", () => {
    expect(
      resolveCliOptions(parseCliArgs(["--config", "./config.ts"]), {
        cma: {
          spaceId: "space-config",
          managementToken: "token-config",
          environment: "staging",
        },
        out: "./generated.ts",
        snapshot: "./types.json",
        snapshotLocales: "./locales.json",
        contentTypeIds: ["blogPost"],
      })
    ).toMatchObject({
      spaceId: "space-config",
      managementToken: "token-config",
      environmentId: "staging",
      out: "./generated.ts",
      snapshot: "./types.json",
      snapshotLocales: "./locales.json",
      contentTypeIds: ["blogPost"],
    });
  });

  it("lets CLI args override config values and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(
      resolveCliOptions(
        parseCliArgs([
          "--space-id",
          "space-cli",
          "--management-token",
          "token-cli",
          "--environment",
          "preview",
          "--out",
          "./cli.ts",
        ]),
        {
          cma: {
            spaceId: "space-config",
            managementToken: "token-config",
            environment: "staging",
          },
          out: "./config.ts",
        }
      )
    ).toMatchObject({
      spaceId: "space-cli",
      managementToken: "token-cli",
      environmentId: "preview",
      out: "./cli.ts",
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--space-id overrides cma.spaceId"));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("--management-token overrides cma.managementToken")
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("--environment overrides cma.environment")
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("--out overrides out"));
  });
});

describe("validateCliOptions", () => {
  it("requires snapshot-locales for from-snapshot when mode is both", () => {
    expect(() =>
      validateCliOptions(
        resolveCliOptions(
          parseCliArgs(["--from-snapshot", "--snapshot", "./types.json", "--out", "./out.ts"]),
          undefined
        ),
        undefined
      )
    ).toThrow(/snapshot-locales/);
  });

  it("allows from-snapshot without locales when mode is cma", () => {
    expect(() =>
      validateCliOptions(
        resolveCliOptions(
          parseCliArgs(["--from-snapshot", "--snapshot", "./types.json", "--out", "./out.ts"]),
          { locale: { mode: "cma" } }
        ),
        { locale: { mode: "cma" } }
      )
    ).not.toThrow();
  });

  it("accepts required live fetch options from config", () => {
    const config = {
      cma: { spaceId: "space-config", managementToken: "token-config" },
      out: "./out.ts",
    };

    expect(() =>
      validateCliOptions(
        resolveCliOptions(parseCliArgs(["--config", "./config.ts"]), config),
        config
      )
    ).not.toThrow();
  });

  it("requires live fetch options when neither CLI nor config provide them", () => {
    expect(() =>
      validateCliOptions(
        resolveCliOptions(parseCliArgs(["--out", "./out.ts"]), undefined),
        undefined
      )
    ).toThrow(/space-id/);
  });
});

describe("requireLocalesSnapshot", () => {
  it("skips check for cma mode", () => {
    expect(() => requireLocalesSnapshot("cma", undefined)).not.toThrow();
  });
});
