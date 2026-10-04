import { describe, expect, it } from "vitest";

import { pascalToKebab, queryModuleFileName, resolveQueryModulePaths } from "./naming";

describe("pascalToKebab", () => {
  it("slugifies PascalCase query names", () => {
    expect(pascalToKebab("PageDetail")).toBe("page-detail");
    expect(pascalToKebab("ProductDetail")).toBe("product-detail");
    expect(pascalToKebab("Q")).toBe("q");
  });

  it("splits acronym boundaries", () => {
    expect(pascalToKebab("XMLParser")).toBe("xml-parser");
    expect(pascalToKebab("HTTPServer")).toBe("http-server");
  });
});

describe("queryModuleFileName", () => {
  it("appends .query.ts", () => {
    expect(queryModuleFileName("PageDetail")).toBe("page-detail.query.ts");
  });
});

describe("resolveQueryModulePaths", () => {
  it("maps each query to a unique relative path", () => {
    const paths = resolveQueryModulePaths(["PageDetail", "ProductDetail"]);
    expect(paths.get("PageDetail")).toBe("page-detail.query.ts");
    expect(paths.get("ProductDetail")).toBe("product-detail.query.ts");
  });

  it("rejects collisions", () => {
    expect(() => resolveQueryModulePaths(["PageDetail", "pageDetail"])).toThrow(
      /Query module filename collision: 'PageDetail' and 'pageDetail' both map to 'page-detail\.query\.ts'/
    );
  });
});
