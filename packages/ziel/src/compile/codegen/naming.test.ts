import { describe, expect, it } from "vitest";

import { queryModuleFileName, resolveQueryModulePaths } from "./naming";

describe("queryModuleFileName", () => {
  it("preserves IR casing and appends .query.ts", () => {
    expect(queryModuleFileName("PageDetail")).toBe("PageDetail.query.ts");
    expect(queryModuleFileName("ProductDetail")).toBe("ProductDetail.query.ts");
    expect(queryModuleFileName("Q")).toBe("Q.query.ts");
  });
});

describe("resolveQueryModulePaths", () => {
  it("maps each query to a unique relative path", () => {
    const paths = resolveQueryModulePaths(["PageDetail", "ProductDetail"]);
    expect(paths.get("PageDetail")).toBe("PageDetail.query.ts");
    expect(paths.get("ProductDetail")).toBe("ProductDetail.query.ts");
  });

  it("rejects case-insensitive collisions", () => {
    expect(() => resolveQueryModulePaths(["PageDetail", "pageDetail"])).toThrow(
      /Query module filename collision: 'PageDetail' and 'pageDetail' collide on case-insensitive path 'pagedetail\.query\.ts'/
    );
  });
});
