import { describe, expect, expectTypeOf, it } from "vitest";

import type { Branded } from "./branded";
import { DomainValidationError } from "./errors";
import { proof } from "./proof";
import { shape } from "./shape";
import type { Validator } from "./validation";

function fail(message: string, code = "invalid") {
  return {
    success: false as const,
    error: {
      engine: "test",
      issues: [{ code, path: [] as const, message }],
    },
  };
}

function nonNegativeRowValidator(): Validator<
  { id: string; count: number },
  { id: string; count: number }
> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const { id, count } = input;
      if (typeof id !== "string") {
        return fail("Invalid id");
      }
      if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
        return fail("count must be non-negative int");
      }
      return { success: true, data: { id, count } };
    },
  };
}

function verifiedSliceValidator(): Validator<{ isVerified: boolean }, { isVerified: boolean }> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const { isVerified } = input;
      if (typeof isVerified !== "boolean") {
        return fail("Invalid isVerified");
      }
      return { success: true, data: { isVerified } };
    },
  };
}

function positiveIntValidator(): Validator<number, number> {
  return {
    engine: "test",
    validate(n) {
      if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
        return fail("Expected positive integer");
      }
      return { success: true, data: n };
    },
  };
}

function itemShapeValidator(): Validator<
  { id: string; count: number; type?: string },
  { type: string; id: string; count: number }
> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const { id, count, type: typeIn } = input;
      if (typeof id !== "string" || typeof count !== "number") {
        return fail("Invalid row");
      }
      if (!Number.isInteger(count) || count < 0) {
        return fail("Invalid count");
      }
      const type = typeof typeIn === "string" ? typeIn : "Item";
      if (type !== "Item") {
        return fail("Invalid type");
      }
      return { success: true, data: { type: "Item", id, count } };
    },
  };
}

function userBaseShapeValidator(): Validator<
  { id: string; isVerified: boolean; type?: string },
  { type: string; id: string; isVerified: boolean }
> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const { id, isVerified, type: typeIn } = input;
      if (typeof id !== "string" || typeof isVerified !== "boolean") {
        return fail("Invalid user");
      }
      const type = typeof typeIn === "string" ? typeIn : "User";
      if (type !== "User") {
        return fail("Invalid type");
      }
      return { success: true, data: { type: "User", id, isVerified } };
    },
  };
}

function userExtendedShapeValidator(): Validator<
  { id: string; isVerified: boolean; department: string; type?: string },
  { type: string; id: string; isVerified: boolean; department: string }
> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "object" || input === null) {
        return fail("Expected object");
      }
      const { id, isVerified, department, type: typeIn } = input;
      if (
        typeof id !== "string" ||
        typeof isVerified !== "boolean" ||
        typeof department !== "string"
      ) {
        return fail("Invalid user extended");
      }
      const type = typeof typeIn === "string" ? typeIn : "User";
      if (type !== "User") {
        return fail("Invalid type");
      }
      return {
        success: true,
        data: {
          type: "User",
          id,
          isVerified,
          department,
        },
      };
    },
  };
}

function userBaseProofValidator(): Validator<
  { type?: string; id: string; isVerified: boolean },
  { type: string; id: string; isVerified: boolean }
> {
  return userBaseShapeValidator();
}

describe("proof", () => {
  const NonNegativeProof = proof("NonNegative", nonNegativeRowValidator());
  const VerifiedProof = proof("Verified", verifiedSliceValidator()).refineType<{
    isVerified: true;
  }>((row): row is { isVerified: boolean } & { isVerified: true } => row.isVerified === true);

  it("assert merges proof onto plain objects and brands nominally", () => {
    const plain = { id: "a", count: 0, isVerified: true as const };
    const proven = NonNegativeProof.assert(plain);
    expect(proven).toEqual(plain);
    expect(NonNegativeProof.test(proven)).toBe(true);
    expect(NonNegativeProof.brand).toBe("NonNegative");

    const verified = VerifiedProof.assert(plain);
    expect(verified).toEqual(plain);
    expect(VerifiedProof.test(verified)).toBe(true);
    expect(VerifiedProof.brand).toBe("Verified");
    expectTypeOf(verified.isVerified).toEqualTypeOf<true>();
  });

  it("assert accepts shape instances and preserves prototype and extra fields", () => {
    const Item = shape("Item", itemShapeValidator());
    const item = Item.create({ id: "x", count: 3 });
    const proven = NonNegativeProof.assert(item);
    expect(proven.id).toBe("x");
    expect(proven.type).toBe("Item");
    expect(proven.count).toBe(3);
    expect(NonNegativeProof.test(proven)).toBe(true);
    expect(Object.getPrototypeOf(proven)).toBe(Object.getPrototypeOf(item));
  });

  it("assert throws DomainValidationError on validator failure", () => {
    expect(() => NonNegativeProof.assert({ id: "d", count: -2 })).toThrow(DomainValidationError);
  });

  it("test rejects invalid structural values", () => {
    expect(NonNegativeProof.test({ id: "e", count: "nope" as unknown as number })).toBe(false);
    expect(NonNegativeProof.test(null)).toBe(false);
  });

  it("works on primitive values", () => {
    const PositiveInt = proof("PositiveInt", positiveIntValidator());
    const n = PositiveInt.assert(7);
    expect(n).toBe(7);
    expect(PositiveInt.test(n)).toBe(true);
    expect(() => PositiveInt.assert(0)).toThrow(DomainValidationError);
  });

  it("refineType guard throws DomainValidationError", () => {
    expect(() => VerifiedProof.assert({ isVerified: false })).toThrow(DomainValidationError);
  });

  it("refined kit has no refineType method", () => {
    const refined = proof("R", nonNegativeRowValidator()).refineType<{ count: 0 }>(
      (row): row is { id: string; count: number } & { count: 0 } => row.count === 0
    );
    expect("refineType" in refined).toBe(false);
    expect(refined.assert({ id: "z", count: 0 })).toMatchObject({ id: "z", count: 0 });
  });

  it("applies same proof to base and extended shapes; preserves prototypes", () => {
    const UserBaseShape = shape("User", userBaseShapeValidator());
    const UserExtendedShape = shape("UserExtended", userExtendedShapeValidator());

    const VerifiedUserFact = proof("VerifiedUserFact", userBaseProofValidator()).refineType<{
      isVerified: true;
    }>((row): row is typeof row & { isVerified: true } => row.isVerified === true);

    type ProofMarked = Branded<
      typeof VerifiedUserFact.brand,
      { type: string; id: string; isVerified: true }
    >;

    const base = UserBaseShape.create({ id: "u-1", isVerified: true });
    const extended = UserExtendedShape.create({
      id: "u-2",
      isVerified: true,
      department: "Platform",
    });

    const provenBase = VerifiedUserFact.assert(base);
    const provenExtended = VerifiedUserFact.assert(extended);

    expect(VerifiedUserFact.test(provenBase)).toBe(true);
    expect(VerifiedUserFact.test(provenExtended)).toBe(true);
    expect(Object.getPrototypeOf(provenBase)).toBe(Object.getPrototypeOf(base));
    expect(Object.getPrototypeOf(provenExtended)).toBe(Object.getPrototypeOf(extended));
    expect(provenExtended.department).toBe("Platform");

    expect(() =>
      VerifiedUserFact.assert(UserBaseShape.create({ id: "u-x", isVerified: false }))
    ).toThrow(DomainValidationError);

    expectTypeOf(provenBase.isVerified).toEqualTypeOf<true>();
    expectTypeOf(provenExtended.isVerified).toEqualTypeOf<true>();
    expectTypeOf(provenBase).toExtend<ProofMarked>();
    expectTypeOf(provenExtended).toExtend<ProofMarked>();
  });
});
