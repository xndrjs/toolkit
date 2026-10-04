import { describe, expect, it } from "vitest";

import { DEFAULT_ZIEL_EXCLUDE, DEFAULT_ZIEL_INCLUDE, defineConfig } from "./define-config";

describe("defineConfig", () => {
  it("defaults include, exclude, and requireDatasourceCoverage", () => {
    expect(defineConfig({})).toEqual({
      include: [...DEFAULT_ZIEL_INCLUDE],
      exclude: [...DEFAULT_ZIEL_EXCLUDE],
      requireDatasourceCoverage: true,
    });
  });

  it("preserves explicit fields and does not invent root/out", () => {
    expect(
      defineConfig({
        root: "/project",
        include: ["src/**/*.ziel"],
        exclude: ["**/fixtures/**"],
        pathFilter: /content/,
        out: "src/generated",
        importFrom: "@xndrjs/ziel",
        registryTypeName: "AppRegistry",
        requireDatasourceCoverage: false,
      })
    ).toEqual({
      root: "/project",
      include: ["src/**/*.ziel"],
      exclude: ["**/fixtures/**"],
      pathFilter: /content/,
      out: "src/generated",
      importFrom: "@xndrjs/ziel",
      registryTypeName: "AppRegistry",
      requireDatasourceCoverage: false,
    });
  });

  it("fills only missing include/exclude/coverage when partial", () => {
    expect(defineConfig({ include: ["a.ziel"] })).toEqual({
      include: ["a.ziel"],
      exclude: [...DEFAULT_ZIEL_EXCLUDE],
      requireDatasourceCoverage: true,
    });

    expect(defineConfig({ exclude: ["**/tmp/**"] })).toEqual({
      include: [...DEFAULT_ZIEL_INCLUDE],
      exclude: ["**/tmp/**"],
      requireDatasourceCoverage: true,
    });
  });
});
