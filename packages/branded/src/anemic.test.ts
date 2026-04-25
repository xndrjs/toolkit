import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { anemic, branded } from "./api";
import { toAnemic } from "./anemic";
import { __brand, __shapeMarker } from "./private-constants";
import { AnemicOutput, BrandedType } from "./types";

const Email = branded.primitive("Email", z.string().email());
const [Address] = branded.shape("Address", {
  schema: z.object({
    type: z.literal("Address").default("Address"),
    city: z.string(),
    street: z.string(),
  }),
  methods: {},
});
const [User] = branded.shape("User", {
  schema: z.object({
    type: z.literal("User").default("User"),
    email: branded.field(Email),
    verifiedAt: z.date().nullable(),
    address: branded.field(Address),
  }),
  methods: {
    isVerified() {
      return this.verifiedAt !== null;
    },
  },
});

type UserEntity = BrandedType<typeof User>;
type VerifiedUserData = UserEntity & { verifiedAt: Date };

const VerifiedUserRefinement = branded
  .refine(User)
  .when((user): user is VerifiedUserData => user.verifiedAt instanceof Date)
  .as("VerifiedUser");

describe("toAnemic", () => {
  it("marks shape instances with __shapeMarker on the prototype chain", () => {
    const user = User.create({
      email: "dev@company.com",
      verifiedAt: null,
      address: { city: "Florence", street: "Via Roma 1" },
    });
    expect(Reflect.has(user, __shapeMarker)).toBe(true);
    expect(Reflect.has(user.address, __shapeMarker)).toBe(true);
  });

  it("drops brand symbols and prototype methods from shape values", () => {
    const user = User.create({
      email: "dev@company.com",
      verifiedAt: null,
      address: { city: "Florence", street: "Via Roma 1" },
    });

    const anemic = toAnemic(user);
    expect(anemic).toEqual({
      type: "User",
      email: "dev@company.com",
      verifiedAt: null,
      address: { type: "Address", city: "Florence", street: "Via Roma 1" },
    });
    expect(Object.keys(anemic)).not.toContain("isVerified");
    expect(Reflect.has(anemic as object, __brand)).toBe(false);
  });

  it("drops methods from refinement values while preserving nested data", () => {
    const user = User.create({
      email: "dev@company.com",
      verifiedAt: new Date("2026-04-20T00:00:00.000Z"),
      address: { city: "Florence", street: "Via Roma 1" },
    });
    const verified = VerifiedUserRefinement.from(user);

    const anemic = toAnemic(verified);
    expect(anemic).toMatchObject({
      type: "User",
      email: "dev@company.com",
      address: { type: "Address", city: "Florence", street: "Via Roma 1" },
    });
    expect(anemic.verifiedAt).toBeInstanceOf(Date);
    expect(Object.keys(anemic)).not.toContain("hasVerificationTimestamp");
    expect(Reflect.has(anemic as object, __brand)).toBe(false);
  });

  it("does not walk plain containers: keeps references and leaves nested shapes untouched", () => {
    const userA = User.create({
      email: "a@company.com",
      verifiedAt: new Date("2026-04-20T00:00:00.000Z"),
      address: { city: "Florence", street: "Via Roma 1" },
    });
    const userB = User.create({
      email: "b@company.com",
      verifiedAt: null,
      address: { city: "Milan", street: "Corso Como 10" },
    });
    const verifiedA = VerifiedUserRefinement.from(userA);

    const complex = {
      owner: verifiedA,
      metadata: {
        reviewers: [verifiedA, userB],
      },
      groups: [
        {
          title: "alpha",
          members: [userA, verifiedA],
        },
      ],
    };

    const anemic = toAnemic(complex);
    expect(anemic).toBe(complex);
    expect(anemic.owner).toBe(verifiedA);
    expect(anemic.metadata.reviewers[0]).toBe(verifiedA);
    expect(anemic.metadata.reviewers[1]).toBe(userB);
  });

  it("maps arrays element-wise: shapes become plain, other values keep identity", () => {
    const user = User.create({
      email: "u@company.com",
      verifiedAt: null,
      address: { city: "F", street: "S" },
    });
    const blob = new Blob(["x"]);
    const row = [user, blob, 1] as const;

    const out = toAnemic(row);
    expect(out[0]).toEqual({
      type: "User",
      email: "u@company.com",
      verifiedAt: null,
      address: { type: "Address", city: "F", street: "S" },
    });
    expect(out[1]).toBe(blob);
    expect(out[2]).toBe(1);
  });

  it("provides a nominal anemic output type for use-case return contracts", () => {
    const user = User.create({
      email: "typed@company.com",
      verifiedAt: null,
      address: { city: "Florence", street: "Via Roma 1" },
    });

    const output = anemic.from(user);
    expectTypeOf(output).toEqualTypeOf<AnemicOutput<UserEntity>>();

    // @ts-expect-error direct branded values must not satisfy AnemicOutput contracts
    const invalidOutput: AnemicOutput<UserEntity> = user;
    expect(invalidOutput).toBeDefined();
  });
});
