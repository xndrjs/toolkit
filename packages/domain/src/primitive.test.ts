import { describe, expect, expectTypeOf, it } from "vitest";

import type { Branded } from "./branded";
import { DomainValidationError } from "./errors";
import { primitive } from "./primitive";
import type { Validator } from "./validation";

function emailValidator(): Validator<string> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "string") {
        return {
          success: false,
          error: {
            engine: "test",
            issues: [{ code: "invalid_type", path: [], message: "Expected string" }],
          },
        };
      }
      const lower = input.toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(lower)) {
        return {
          success: false,
          error: {
            engine: "test",
            issues: [{ code: "invalid_format", path: [], message: "Invalid email" }],
          },
        };
      }
      return { success: true, data: lower };
    },
  };
}

function positiveIntegerValidator(): Validator<number> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "number" || !Number.isInteger(input) || input <= 0) {
        return {
          success: false,
          error: {
            engine: "test",
            issues: [{ code: "not_positive_int", path: [], message: "Expected positive integer" }],
          },
        };
      }
      return { success: true, data: input };
    },
  };
}

describe("primitive", () => {
  const Email = primitive("Email", emailValidator());
  const PositiveInteger = primitive("PositiveInteger", positiveIntegerValidator());

  it("create returns validated output with nominal typing", () => {
    const email = Email.create("USER@EXAMPLE.COM");
    expect(email).toBe("user@example.com");
    expectTypeOf(email).toEqualTypeOf<Readonly<Branded<"Email", string>>>();
  });

  it("exposes type and validator metadata", () => {
    expect(Email.type).toBe("Email");
    expect(Email.validator.engine).toBe("test");
    expect(Email.validator.validate("a@b.com").success).toBe(true);
  });

  it("is() is true only for valid values", () => {
    expect(Email.is("x@y.com")).toBe(true);
    expect(Email.is("not-an-email")).toBe(false);
    expect(Email.is(42)).toBe(false);
    expect(Email.is({ value: "x@y.com" })).toBe(false);
  });

  it("create throws DomainValidationError on invalid input", () => {
    expect(() => Email.create("")).toThrow(DomainValidationError);
    expect(() => Email.create("not-an-email")).toThrow(DomainValidationError);
  });

  it("safeCreate mirrors validation outcome", () => {
    const ok = Email.safeCreate("A@B.CO");
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data).toBe("a@b.co");
    }
    const bad = Email.safeCreate("nope");
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("validates positive integer primitive", () => {
    const n = PositiveInteger.create(42);
    expect(n).toBe(42);
    expect(PositiveInteger.is(10)).toBe(true);
    expect(PositiveInteger.is(0)).toBe(false);
    expect(PositiveInteger.is(-1)).toBe(false);
    expect(PositiveInteger.is(1.5)).toBe(false);
    expect(PositiveInteger.is("10")).toBe(false);
    expect(() => PositiveInteger.create(0)).toThrow(DomainValidationError);
  });

  it("preserves issues on DomainValidationError", () => {
    try {
      PositiveInteger.create(0);
      throw new Error("Expected PositiveInteger.create(0) to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainValidationError);
      const validationError = error as DomainValidationError;
      expect(validationError.issues.length).toBeGreaterThan(0);
      expect(validationError.failure.issues.length).toBeGreaterThan(0);
      expect(validationError.code).toBe("DOMAIN_VALIDATION_ERROR");
    }
  });
});
