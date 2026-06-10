import { describe, expect, it } from "vitest";

import { getCollapsedBoxHeight } from "./layout-metrics";

describe("getCollapsedBoxHeight", () => {
  it("fits a title-only collapsed header", () => {
    expect(getCollapsedBoxHeight()).toBe(56);
  });

  it("fits a collapsed header with package metadata", () => {
    expect(getCollapsedBoxHeight({ hasPackageName: true })).toBe(64);
  });
});
