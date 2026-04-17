import { describe, expect, it } from "vitest";
import { z } from "zod";

import { BrandedError, BrandedRefinementError, BrandedValidationError } from "./api";

describe("branded errors", () => {
  it("BrandedError stores code, message, and cause", () => {
    const cause = new Error("root cause");
    const error = new BrandedError("E_TEST", "Test message", { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BrandedError);
    expect(error.name).toBe("BrandedError");
    expect(error.code).toBe("E_TEST");
    expect(error.message).toBe("Test message");
    expect(error.cause).toBe(cause);
  });

  it("BrandedValidationError keeps zod details and stable code", () => {
    const result = z.number().int().positive().safeParse(-1);
    if (result.success) {
      throw new Error("Expected zod validation to fail");
    }

    const error = new BrandedValidationError("Invalid input", result.error);

    expect(error).toBeInstanceOf(BrandedError);
    expect(error.name).toBe("BrandedValidationError");
    expect(error.code).toBe("BRANDED_VALIDATION_ERROR");
    expect(error.zodError).toBe(result.error);
    expect(error.issues).toBe(result.error.issues);
    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.cause).toBe(result.error);

    const flat = error.flatten();
    expect(flat.formErrors.length + Object.keys(flat.fieldErrors).length).toBeGreaterThan(0);

    const tree = error.treeify();
    expect(tree).toBeDefined();
    expect("errors" in tree && Array.isArray(tree.errors)).toBe(true);
    expect(tree.errors.length).toBeGreaterThan(0);
  });

  it("BrandedRefinementError exposes brand and stable code", () => {
    const error = new BrandedRefinementError("VerifiedUser");

    expect(error).toBeInstanceOf(BrandedError);
    expect(error.name).toBe("BrandedRefinementError");
    expect(error.code).toBe("BRANDED_REFINEMENT_ERROR");
    expect(error.brand).toBe("VerifiedUser");
    expect(error.message).toContain("VerifiedUser");
  });
});
