import { describe, expect, it } from "vitest";
import { z } from "zod";

import { branded, BrandedType, Branded, BrandedRefinementError } from "./api";
import { __brand } from "./private-constants";

const UserSchema = z.object({
  id: z.string(),
  isVerified: z.boolean(),
  additionalData: z.string().optional(),
});

const [UserShape, patchUser] = branded.shape("User", UserSchema);

type User = BrandedType<typeof UserShape>;

type VerifiedUser = Branded<"VerifiedUser", User & { isVerified: true; additionalData: string }>;

const VerifiedUserRefinement = branded.refinement<typeof UserShape, VerifiedUser>("VerifiedUser", {
  is: (user): user is VerifiedUser =>
    user.isVerified === true && typeof user.additionalData === "string",
});

type VerifiedUserFromKit = BrandedType<typeof VerifiedUserRefinement>;

describe("branded refinement", () => {
  it("BrandedType of refinement kit is the value returned by from()", () => {
    const user = UserShape.create({
      id: "u-0",
      isVerified: true,
      additionalData: "x",
    });
    const verified: VerifiedUserFromKit = VerifiedUserRefinement.from(user);
    expect(verified.additionalData).toBe("x");
    expect(VerifiedUserRefinement.is(verified)).toBe(true);
  });

  it("brands a valid base shape into a refined branded guarantee", () => {
    const user = UserShape.create({
      id: "u-1",
      isVerified: true,
      additionalData: "present",
    });

    const verified = VerifiedUserRefinement.from(user);
    expect(verified.isVerified).toBe(true);
    expect(verified.additionalData).toBe("present");
    expect(verified.type).toBe("User");
    expect(verified[__brand]).toEqual({
      User: true,
      VerifiedUser: true,
    });
  });

  it("rejects invalid refinement input via from()", () => {
    const user = UserShape.create({
      id: "u-2",
      isVerified: false,
    });

    expect(() => VerifiedUserRefinement.from(user)).toThrow(BrandedRefinementError);
  });

  it("tryFrom returns null for non-refined values", () => {
    const user = UserShape.create({
      id: "u-3",
      isVerified: true,
    });

    expect(VerifiedUserRefinement.tryFrom(user)).toBeNull();
  });

  it("assert narrows and keeps runtime discriminant", () => {
    const user = UserShape.create({
      id: "u-4",
      isVerified: true,
      additionalData: "ok",
    });

    const verified = VerifiedUserRefinement.from(user);
    expect(verified.type).toBe("User");
    expect(VerifiedUserRefinement.is(verified)).toBe(true);
  });

  it("shape patch preserves refinement brands from the entity", () => {
    const user = UserShape.create({
      id: "u-6",
      isVerified: true,
      additionalData: "before",
    });
    const verified = VerifiedUserRefinement.from(user);
    const next = patchUser(verified, { additionalData: "after" });
    expect(next.additionalData).toBe("after");
    expect(next[__brand]).toEqual({
      User: true,
      VerifiedUser: true,
    });
    expect(VerifiedUserRefinement.is(next)).toBe(true);
  });

  it("from() does not mutate the source value and returns a frozen clone", () => {
    const user = UserShape.create({
      id: "u-5",
      isVerified: true,
      additionalData: "ok",
    });

    const beforeBrand = user[__brand];
    const verified = VerifiedUserRefinement.from(user);

    expect(verified).not.toBe(user);
    expect(Object.isFrozen(verified)).toBe(true);
    expect(Object.isFrozen(verified[__brand])).toBe(true);
    expect(user[__brand]).toBe(beforeBrand);
    expect(user[__brand]).toEqual({ User: true });
    expect(verified[__brand]).toEqual({ User: true, VerifiedUser: true });
  });
});
