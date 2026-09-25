import { describe, expect, it } from "vitest";

import { DEFAULT_NAVIQL_EXCLUDE, DEFAULT_NAVIQL_INCLUDE, defineConfig } from "./define-config";

describe("defineConfig", () => {
  it("defaults include and exclude", () => {
    expect(defineConfig({})).toEqual({
      include: [...DEFAULT_NAVIQL_INCLUDE],
      exclude: [...DEFAULT_NAVIQL_EXCLUDE],
    });
  });

  it("preserves explicit fields and does not invent root/out", () => {
    expect(
      defineConfig({
        root: "/project",
        include: ["src/**/*.naviql"],
        exclude: ["**/fixtures/**"],
        pathFilter: /content/,
        out: "src/generated/resources.ts",
        importFrom: "@xndrjs/naviql",
        registryTypeName: "AppRegistry",
      })
    ).toEqual({
      root: "/project",
      include: ["src/**/*.naviql"],
      exclude: ["**/fixtures/**"],
      pathFilter: /content/,
      out: "src/generated/resources.ts",
      importFrom: "@xndrjs/naviql",
      registryTypeName: "AppRegistry",
    });
  });

  it("fills only missing include/exclude when partial", () => {
    expect(defineConfig({ include: ["a.naviql"] })).toEqual({
      include: ["a.naviql"],
      exclude: [...DEFAULT_NAVIQL_EXCLUDE],
    });

    expect(defineConfig({ exclude: ["**/tmp/**"] })).toEqual({
      include: [...DEFAULT_NAVIQL_INCLUDE],
      exclude: ["**/tmp/**"],
    });
  });
});
