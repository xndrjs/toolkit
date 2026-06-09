import { describe, expect, it } from "vitest";

import { gordioPackageName } from "./index";

describe("@xndrjs/gordio", () => {
  it("exports a package marker", () => {
    expect(gordioPackageName).toBe("@xndrjs/gordio");
  });
});
