import { describe, expect, it } from "vitest";
import * as v from "valibot";

import { valibotToValidator } from "./valibot-to-validator";

describe("valibotToValidator", () => {
  it("returns success with parsed output", () => {
    const validator = valibotToValidator(v.pipe(v.string(), v.email()));
    const result = validator.validate("a@b.co");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("a@b.co");
    }
  });

  it("returns failure with core ValidationIssue list", () => {
    const validator = valibotToValidator(v.pipe(v.string(), v.email()));
    const result = validator.validate("not-an-email");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.engine).toBe("valibot");
      expect(result.error.issues.length).toBeGreaterThan(0);
      expect(typeof result.error.issues[0]?.message).toBe("string");
    }
  });
});
