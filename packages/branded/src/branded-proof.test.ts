import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { branded } from "./api";
import type { Branded, BrandedType } from "./types";
import { BrandedValidationError } from "./errors";

describe("branded.proof", () => {
  const NonNegativeRow = branded.proof(
    "NonNegativeRow",
    z.object({
      id: z.string(),
      count: z.number().int().nonnegative(),
    })
  );
  type ProvenRow = BrandedType<typeof NonNegativeRow>;

  it("parse validates and returns a nominally branded value", () => {
    const plain = { id: "a", count: 0 };
    const proven = NonNegativeRow.parse(plain);
    expect(proven).toEqual(plain);
    expect(NonNegativeRow.is(proven)).toBe(true);
    expect(NonNegativeRow.brand).toBe("NonNegativeRow");
    expectTypeOf(proven).toEqualTypeOf<ProvenRow>();
  });

  it("parse accepts the same structural data from a shape create()", () => {
    const ItemShape = branded.shape(
      "Item",
      z.object({
        type: z.literal("Item").default("Item"),
        id: z.string(),
        count: z.number().int().nonnegative(),
      })
    );
    const item = ItemShape.create({ id: "x", count: 3 });
    const proven = NonNegativeRow.parse(item);
    expect(proven.id).toBe("x");
    expect(proven.type).toBe("Item"); // preserves shape data and typing
    expect(proven.count).toBe(3);
    expect(NonNegativeRow.is(proven)).toBe(true);
  });

  it("safeParse mirrors Zod outcome with branded data on success", () => {
    const ok = NonNegativeRow.safeParse({ id: "b", count: 1 });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expectTypeOf(ok.data).toExtend<ProvenRow>();
      expect(ok.data.count).toBe(1);
    }

    const bad = NonNegativeRow.safeParse({ id: "c", count: -1 });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("parse throws BrandedValidationError on schema failure", () => {
    expect(() => NonNegativeRow.parse({ id: "d", count: -2 })).toThrow(BrandedValidationError);
  });

  it("is rejects values that fail the schema", () => {
    expect(NonNegativeRow.is({ id: "e", count: "nope" })).toBe(false);
    expect(NonNegativeRow.is(null)).toBe(false);
  });

  it("works on a primitive schema", () => {
    const PositiveInt = branded.proof("PositiveInt", z.number().int().positive());
    const n = PositiveInt.parse(7);
    expect(n).toBe(7);
    expect(PositiveInt.is(n)).toBe(true);
    expect(() => PositiveInt.parse(0)).toThrow(BrandedValidationError);
  });

  it("applies the same proof to a base shape and an extended shape; preserves prototype and intersects types", () => {
    const UserBaseSchema = z.object({
      type: z.literal("User").default("User"),
      id: z.string(),
      isVerified: z.boolean(),
    });

    const UserBaseShape = branded.shape("User", UserBaseSchema);
    const UserBaseKit = branded.capabilities(UserBaseShape, () => ({}));

    const UserExtendedCore = UserBaseKit.extend("UserExtended", (baseSchema) => ({
      schema: baseSchema.extend({
        department: z.string(),
      }),
    }));
    const UserExtendedKit = branded.capabilities(UserExtendedCore, () => ({}));

    const VerifiedUserFact = branded
      .proof("VerifiedUserFact", UserBaseSchema)
      .refineType<{ isVerified: true }>((row) => row.isVerified === true);

    type ProofRow = z.output<typeof UserBaseSchema> & { isVerified: true };
    type ProofMarked = Branded<typeof VerifiedUserFact.brand, ProofRow>;
    type ProvenUser = BrandedType<typeof VerifiedUserFact>;
    type BaseEntity = BrandedType<typeof UserBaseKit>;
    type ExtendedEntity = BrandedType<typeof UserExtendedKit>;

    const base = UserBaseKit.create({ id: "u-1", isVerified: true });
    const extended = UserExtendedKit.create({
      id: "u-2",
      isVerified: true,
      department: "Platform",
    });

    const provenBase = VerifiedUserFact.parse(base);
    const provenExtended = VerifiedUserFact.parse(extended);

    expect(VerifiedUserFact.is(provenBase)).toBe(true);
    expect(VerifiedUserFact.is(provenExtended)).toBe(true);
    expect(Object.getPrototypeOf(provenBase)).toBe(Object.getPrototypeOf(base));
    expect(Object.getPrototypeOf(provenExtended)).toBe(Object.getPrototypeOf(extended));
    expect(provenExtended.department).toBe("Platform");

    expect(() =>
      VerifiedUserFact.parse(UserBaseKit.create({ id: "u-x", isVerified: false }))
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
    expect(refined.parse({ n: 1 })).toEqual({ n: 1 });
  });
});
