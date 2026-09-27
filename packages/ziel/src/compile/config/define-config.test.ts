import { describe, expect, it } from "vitest";

import { DEFAULT_ZIEL_EXCLUDE, DEFAULT_ZIEL_INCLUDE, defineConfig } from "./define-config";

describe("defineConfig", () => {
  it("defaults include and exclude", () => {
    expect(defineConfig({})).toEqual({
      include: [...DEFAULT_ZIEL_INCLUDE],
      exclude: [...DEFAULT_ZIEL_EXCLUDE],
    });
  });

  it("preserves explicit fields and does not invent root/out", () => {
    expect(
      defineConfig({
        root: "/project",
        include: ["src/**/*.ziel"],
        exclude: ["**/fixtures/**"],
        pathFilter: /content/,
        out: "src/generated/resources.ts",
        importFrom: "@xndrjs/ziel",
        registryTypeName: "AppRegistry",
      })
    ).toEqual({
      root: "/project",
      include: ["src/**/*.ziel"],
      exclude: ["**/fixtures/**"],
      pathFilter: /content/,
      out: "src/generated/resources.ts",
      importFrom: "@xndrjs/ziel",
      registryTypeName: "AppRegistry",
    });
  });

  it("fills only missing include/exclude when partial", () => {
    expect(defineConfig({ include: ["a.ziel"] })).toEqual({
      include: ["a.ziel"],
      exclude: [...DEFAULT_ZIEL_EXCLUDE],
    });

    expect(defineConfig({ exclude: ["**/tmp/**"] })).toEqual({
      include: [...DEFAULT_ZIEL_INCLUDE],
      exclude: ["**/tmp/**"],
    });
  });
});
