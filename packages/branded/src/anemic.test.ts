import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { anemic, branded } from "./api";
import { toAnemic } from "./anemic";
import { __brand } from "./private-constants";
import { AnemicOutput, BrandedType } from "./types";

const Email = branded.primitive("Email", z.string().email());
const [Address] = branded.shape(
  "Address",
  z.object({
    type: z.literal("Address").default("Address"),
    city: z.string(),
    street: z.string(),
  }),
  {
    methods: {},
  }
);
const [User] = branded.shape(
  "User",
  z.object({
    type: z.literal("User").default("User"),
    email: branded.field(Email),
    verifiedAt: z.date().nullable(),
    address: branded.field(Address),
  }),
  {
    methods: {
      isVerified() {
        return this.verifiedAt !== null;
      },
    },
  }
);

type UserEntity = BrandedType<typeof User>;
type VerifiedUserData = UserEntity & { verifiedAt: Date };

const VerifiedUserRefinement = branded
  .refine(User)
  .when((user): user is VerifiedUserData => user.verifiedAt instanceof Date)
  .as("VerifiedUser");

describe("toAnemic", () => {
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

  it("recursively converts nested objects and arrays containing shape/refinement values", () => {
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
    expect(anemic).toMatchObject({
      owner: {
        type: "User",
        email: "a@company.com",
        address: { type: "Address", city: "Florence", street: "Via Roma 1" },
      },
      metadata: {
        reviewers: [
          { type: "User", email: "a@company.com" },
          { type: "User", email: "b@company.com" },
        ],
      },
      groups: [
        {
          title: "alpha",
          members: [
            { type: "User", email: "a@company.com" },
            { type: "User", email: "a@company.com" },
          ],
        },
      ],
    });

    expect(anemic.owner.verifiedAt).toBeInstanceOf(Date);
    expect(anemic.metadata.reviewers[0]?.verifiedAt).toBeInstanceOf(Date);
    expect(anemic.metadata.reviewers[1]?.verifiedAt).toBeNull();

    expect(Reflect.has(anemic.owner as object, __brand)).toBe(false);
    expect(Reflect.has(anemic.metadata.reviewers[0] as object, __brand)).toBe(false);
    expect("isVerified" in (anemic.owner as object)).toBe(false);
    expect("hasVerificationTimestamp" in (anemic.owner as object)).toBe(false);
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
