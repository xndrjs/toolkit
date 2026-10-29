import { describe, expect, it } from "vitest";
import { findRegionsInFile } from "./sync.js";
import { wrapSyncRegion } from "./helpers.js";

describe("wrapSyncRegion", () => {
  it("wraps body with // markers and a trailing newline", () => {
    expect(wrapSyncRegion("models-barrel", 'export * from "./a.js";')).toBe(
      [
        "// plop-os-sync start models-barrel",
        'export * from "./a.js";',
        "// plop-os-sync end models-barrel",
        "",
      ].join("\n")
    );
  });

  it("strips trailing whitespace from the body", () => {
    expect(wrapSyncRegion("x", "line\n\n  ")).toBe(
      ["// plop-os-sync start x", "line", "// plop-os-sync end x", ""].join("\n")
    );
  });

  it("supports an empty body", () => {
    expect(wrapSyncRegion("empty", "")).toBe(
      ["// plop-os-sync start empty", "// plop-os-sync end empty", ""].join("\n")
    );
  });

  it("produces a region findRegionsInFile can parse", () => {
    const content = wrapSyncRegion("models-barrel", "interior");
    const regions = findRegionsInFile("file.ts", content);
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({
      syncId: "models-barrel",
      startLine: 0,
      endLine: 2,
    });
  });
});
