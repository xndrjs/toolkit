import { describe, expect, it } from "vitest";

import { parseCliArgs, requireLocalesSnapshot, validateCliOptions } from "./args";

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

  it("reads credentials from environment", () => {
    const prev = {
      space: process.env.CONTENTFUL_SPACE_ID,
      token: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
      env: process.env.CONTENTFUL_ENVIRONMENT,
    };

    process.env.CONTENTFUL_SPACE_ID = "space-env";
    process.env.CONTENTFUL_MANAGEMENT_TOKEN = "token-env";
    process.env.CONTENTFUL_ENVIRONMENT = "staging";

    try {
      expect(parseCliArgs([])).toMatchObject({
        spaceId: "space-env",
        managementToken: "token-env",
        environmentId: "staging",
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
      if (prev.env === undefined) {
        delete process.env.CONTENTFUL_ENVIRONMENT;
      } else {
        process.env.CONTENTFUL_ENVIRONMENT = prev.env;
      }
    }
  });
});

describe("validateCliOptions", () => {
  it("requires snapshot-locales for from-snapshot when mode is both", () => {
    expect(() =>
      validateCliOptions(
        {
          ...parseCliArgs(["--from-snapshot", "--snapshot", "./types.json", "--out", "./out.ts"]),
          fromSnapshot: true,
          snapshot: "./types.json",
        },
        undefined
      )
    ).toThrow(/snapshot-locales/);
  });

  it("allows from-snapshot without locales when mode is cma", () => {
    expect(() =>
      validateCliOptions(
        {
          ...parseCliArgs(["--from-snapshot", "--snapshot", "./types.json", "--out", "./out.ts"]),
          fromSnapshot: true,
          snapshot: "./types.json",
        },
        { locale: { mode: "cma" } }
      )
    ).not.toThrow();
  });
});

describe("requireLocalesSnapshot", () => {
  it("skips check for cma mode", () => {
    expect(() => requireLocalesSnapshot("cma", undefined)).not.toThrow();
  });
});
