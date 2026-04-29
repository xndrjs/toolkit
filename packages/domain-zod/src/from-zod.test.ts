import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fromZod } from "./from-zod";

describe("fromZod", () => {
  it("returns success with parsed output", () => {
    const v = fromZod(z.string().email());
    const r = v.validate("a@b.co");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toBe("a@b.co");
    }
  });

  it("returns failure with core ValidationIssue list", () => {
    const v = fromZod(z.string().email());
    const r = v.validate("not-an-email");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.engine).toBe("zod");
      expect(r.error.issues.length).toBeGreaterThan(0);
      expect(typeof r.error.issues[0]?.message).toBe("string");
    }
  });
});
