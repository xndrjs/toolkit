import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { branded } from "./api";
import type { Branded, BrandedType } from "./types";
import { BrandedValidationError } from "./errors";

describe("branded.proof", () => {
  const NonNegativeProof = branded.proof(
    "NonNegative",
    z.object({
      id: z.string(),
      count: z.number().int().nonnegative(),
    })
  );
  type NonNegativeRow = BrandedType<typeof NonNegativeProof>;

  const VerifiedProof = branded
    .proof(
      "Verified",
      z.object({
        isVerified: z.boolean().refine((v) => v === true),
      })
    )
    .refineType<{ isVerified: true }>((row) => row.isVerified);
  type VerifiedRow = BrandedType<typeof VerifiedProof>;

  it("test validates and returns a nominally branded value", () => {
    const plain = { id: "a", count: 0, isVerified: true };
    const proven = NonNegativeProof.test(plain);
    expect(proven).toEqual(plain);
    expect(NonNegativeProof.is(proven)).toBe(true);
    expect(NonNegativeProof.brand).toBe("NonNegative");
    expectTypeOf(proven).toExtend<NonNegativeRow>();

    const verified = VerifiedProof.test(plain);
    expect(verified).toEqual(plain);
    expect(VerifiedProof.is(verified)).toBe(true);
    expect(VerifiedProof.brand).toBe("Verified");
    expectTypeOf(verified).toExtend<VerifiedRow>();
    expectTypeOf(verified.isVerified).toEqualTypeOf(true);
  });

  it("test accepts the same structural data from a shape create()", () => {
    const ItemShape = branded.shape(
      "Item",
      z.object({
        type: z.literal("Item").default("Item"),
        id: z.string(),
        count: z.number().int().nonnegative(),
      })
    );
    const item = ItemShape.create({ id: "x", count: 3 });
    const proven = NonNegativeProof.test(item);
    expect(proven.id).toBe("x");
    expect(proven.type).toBe("Item"); // preserves shape data and typing
    expect(proven.count).toBe(3);
    expect(NonNegativeProof.is(proven)).toBe(true);
  });

  it("safeParse mirrors Zod outcome with branded data on success", () => {
    const ok = NonNegativeProof.safeParse({ id: "b", count: 1 });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expectTypeOf(ok.data).toExtend<NonNegativeRow>();
      expect(ok.data.count).toBe(1);
    }

    const bad = NonNegativeProof.safeParse({ id: "c", count: -1 });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("test throws BrandedValidationError on schema failure", () => {
    expect(() => NonNegativeProof.test({ id: "d", count: -2 })).toThrow(BrandedValidationError);
  });

  it("is rejects values that fail the schema", () => {
    expect(NonNegativeProof.is({ id: "e", count: "nope" })).toBe(false);
    expect(NonNegativeProof.is(null)).toBe(false);
  });

  it("works on a primitive schema", () => {
    const PositiveInt = branded.proof("PositiveInt", z.number().int().positive());
    const n = PositiveInt.test(7);
    expect(n).toBe(7);
    expect(PositiveInt.is(n)).toBe(true);
    expect(() => PositiveInt.test(0)).toThrow(BrandedValidationError);
  });

  it("applies the same proof to a base shape and an extended shape; preserves prototype and intersects types", () => {
    const UserBaseSchema = z.object({
      type: z.literal("User").default("User"),
      id: z.string(),
      isVerified: z.boolean(),
    });

    const UserBaseShape = branded.shape("User", UserBaseSchema);

    const UserExtendedShape = UserBaseShape.extend("UserExtended", (baseSchema) => ({
      schema: baseSchema.extend({
        department: z.string(),
      }),
    }));

    const VerifiedUserFact = branded
      .proof("VerifiedUserFact", UserBaseSchema)
      .refineType<{ isVerified: true }>((row) => row.isVerified === true);

    type ProofRow = z.output<typeof UserBaseSchema> & { isVerified: true };
    type ProofMarked = Branded<typeof VerifiedUserFact.brand, ProofRow>;
    type ProvenUser = BrandedType<typeof VerifiedUserFact>;
    type BaseEntity = BrandedType<typeof UserBaseShape>;
    type ExtendedEntity = BrandedType<typeof UserExtendedShape>;

    const base = UserBaseShape.create({ id: "u-1", isVerified: true });
    const extended = UserExtendedShape.create({
      id: "u-2",
      isVerified: true,
      department: "Platform",
    });

    const provenBase = VerifiedUserFact.test(base);
    const provenExtended = VerifiedUserFact.test(extended);

    expect(VerifiedUserFact.is(provenBase)).toBe(true);
    expect(VerifiedUserFact.is(provenExtended)).toBe(true);
    expect(Object.getPrototypeOf(provenBase)).toBe(Object.getPrototypeOf(base));
    expect(Object.getPrototypeOf(provenExtended)).toBe(Object.getPrototypeOf(extended));
    expect(provenExtended.department).toBe("Platform");

    expect(() =>
      VerifiedUserFact.test(UserBaseShape.create({ id: "u-x", isVerified: false }))
    ).toThrow(BrandedValidationError);

    expectTypeOf(provenBase).toExtend<BaseEntity>();
    expectTypeOf(provenBase).toExtend<ProofMarked>();
    expectTypeOf(provenExtended).toExtend<ExtendedEntity>();
    expectTypeOf(provenExtended).toExtend<ProofMarked>();
    expectTypeOf(provenBase.isVerified).toEqualTypeOf<true>();
    expectTypeOf(provenExtended.isVerified).toEqualTypeOf<true>();
    expectTypeOf<ProvenUser>().toEqualTypeOf<ProofMarked>();
  });

  it("refineType returns a plain kit without refineType on the object", () => {
    const Row = z.object({ n: z.number() });
    const refined = branded.proof("R", Row).refineType<{ n: 1 }>((r) => r.n === 1);
    expect("refineType" in refined).toBe(false);
    expect(refined.test({ n: 1 })).toEqual({ n: 1 });
  });
});
