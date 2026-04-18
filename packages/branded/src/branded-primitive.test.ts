import { describe, expect, it } from "vitest";
import { z } from "zod";

import { branded } from "./api";
import { BrandedValidationError } from "./errors";

describe("branded primitive", () => {
  const EmailSchema = z
    .string()
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
    .transform((v) => v.toLowerCase());
  const Email = branded.primitive("Email", EmailSchema);
  const PositiveInteger = branded.primitive("PositiveInteger", z.number().int().positive());

  it("creates branded primitive from valid raw input", () => {
    const email = Email.create("USER@EXAMPLE.COM");
    expect(email).toBe("user@example.com");
  });

  it("exposes schema and type metadata", () => {
    expect(Email.type).toBe("Email");
    expect(Email.schema.parse("a@b.com")).toBe("a@b.com");
  });

  it("is() returns true only for schema-valid values", () => {
    expect(Email.is("x@y.com")).toBe(true);
    expect(Email.is("not-an-email")).toBe(false);
    expect(Email.is(42)).toBe(false);
    expect(Email.is({ value: "x@y.com" })).toBe(false);
  });

  it("create() throws on invalid raw value", () => {
    expect(() => Email.create("")).toThrow(BrandedValidationError);
    expect(() => Email.create("not-an-email")).toThrow(BrandedValidationError);
  });

  it("validates positive integer primitive for numeric domain values", () => {
    const n = PositiveInteger.create(42);
    expect(n).toBe(42);
    expect(PositiveInteger.is(10)).toBe(true);
    expect(PositiveInteger.is(0)).toBe(false);
    expect(PositiveInteger.is(-1)).toBe(false);
    expect(PositiveInteger.is(1.5)).toBe(false);
    expect(PositiveInteger.is("10")).toBe(false);
    expect(() => PositiveInteger.create(0)).toThrow(BrandedValidationError);
  });

  it("preserves zod issues in BrandedValidationError", () => {
    try {
      PositiveInteger.create(0);
      throw new Error("Expected PositiveInteger.create(0) to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BrandedValidationError);
      const validationError = error as BrandedValidationError;
      expect(validationError.issues.length).toBeGreaterThan(0);
      expect(validationError.zodError.issues.length).toBeGreaterThan(0);
      expect(validationError.code).toBe("BRANDED_VALIDATION_ERROR");
    }
  });
});
