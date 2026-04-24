import { describe, expect, it } from "vitest";
import { z } from "zod";

import { branded } from "./api";
import { baseErrorSchema } from "./error-shape";
import { BrandedValidationError } from "./errors";
import type { BrandedType } from "./types";

describe("baseErrorSchema", () => {
  it("defaults kind to Error", () => {
    const r = baseErrorSchema.safeParse({ code: "E_TEST", message: "hello" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.kind).toBe("Error");
      expect(r.data.code).toBe("E_TEST");
      expect(r.data.message).toBe("hello");
    }
  });
});

describe("branded.errorShape", () => {
  it("schema applies type as z.literal(brand).default(brand): omitted → brand", () => {
    const UserNotFound = branded.errorShape("UserNotFound");

    const parsed = UserNotFound.schema.safeParse({
      code: "USER_NOT_FOUND",
      message: "nope",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe("UserNotFound");
    }
  });

  it("schema accepts explicit type when it matches the literal", () => {
    const UserNotFound = branded.errorShape("UserNotFound");

    const parsed = UserNotFound.schema.safeParse({
      code: "X",
      message: "y",
      type: "UserNotFound",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe("UserNotFound");
    }
  });

  it("schema rejects type when it does not match the literal", () => {
    const UserNotFound = branded.errorShape("UserNotFound");

    const parsed = UserNotFound.schema.safeParse({
      code: "X",
      message: "y",
      type: "WrongKind",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.join(".") === "type")).toBe(true);
    }
  });

  it("create throws BrandedValidationError when type literal is wrong", () => {
    const UserNotFound = branded.errorShape("UserNotFound");

    expect(() =>
      UserNotFound.create({
        code: "X",
        message: "y",
        // @ts-expect-error — must match z.literal("UserNotFound")
        type: "Other",
      })
    ).toThrow(BrandedValidationError);
  });

  it("adds type discriminant with default equal to the brand name", () => {
    const UserNotFound = branded.errorShape("UserNotFound");

    const e = UserNotFound.create({
      code: "USER_NOT_FOUND",
      message: "nope",
    });

    expect(e.type).toBe("UserNotFound");
    expect(UserNotFound.is(e)).toBe(true);
    expect(Object.isFrozen(e)).toBe(true);
  });

  it("accepts optional extend from baseErrorSchema", () => {
    const UserNotFound = branded.errorShape("UserNotFound", (base) =>
      base.extend({
        metadata: z.object({ id: z.string() }),
      })
    );

    const e = UserNotFound.create({
      code: "USER_NOT_FOUND",
      message: "nope",
      metadata: { id: "u-1" },
    });

    expect(e.type).toBe("UserNotFound");
    expect(e.metadata.id).toBe("u-1");
    type Row = BrandedType<typeof UserNotFound>;
    const _r: Row = e;
    expect(_r).toBeDefined();
  });

  it("returns only the kit (no patch tuple)", () => {
    const Kit = branded.errorShape("X");
    expect(Kit).toHaveProperty("create");
    expect(Kit).toHaveProperty("is");
    expect(Kit).toHaveProperty("schema");
    expect(Kit).toHaveProperty("type");
    expect(Array.isArray(Kit)).toBe(false);
  });

  it("refinement narrows by predicate (same row shape)", () => {
    const GenericError = branded.errorShape("BaseError");

    type NotFoundRow = BrandedType<typeof GenericError> & { code: "USER_NOT_FOUND" };

    const UserNotFoundRefinement = branded
      .refine(GenericError)
      .when((e): e is NotFoundRow => e.code === "USER_NOT_FOUND")
      .as("UserNotFound");

    const base = GenericError.create({ code: "USER_NOT_FOUND", message: "nope" });
    const refined = UserNotFoundRefinement.from(base);
    expect(refined.code).toBe("USER_NOT_FOUND");
    expect(base.type).toBe("BaseError");
  });
});
