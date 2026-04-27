import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { branded } from "./api";
import { pipe } from "./pipe";
import { BrandedValidationError } from "./errors";

describe("pipe with shape kits and proofs", () => {
  const UserSchema = z.object({
    type: z.literal("User").default("User"),
    id: z.string(),
    email: z.string().email(),
    displayName: z.string(),
    isVerified: z.boolean(),
    address: z.object({
      type: z.literal("Address").default("Address"),
      city: z.string(),
      street: z.string(),
    }),
  });

  const UserShape = branded.shape("User", UserSchema);
  const UserKit = branded.capabilities(UserShape, (patch) => ({
    rename(user, displayName: string) {
      return patch(user, { displayName });
    },
  }));

  const UserDetailShape = UserKit.extend("UserDetail", (baseSchema) => ({
    schema: baseSchema.extend({
      avatarSrc: z.string().url(),
    }),
  }));

  const VerifiedUserFact = branded
    .proof("VerifiedUser", UserSchema)
    .refineType<{ isVerified: true }>((row) => row.isVerified === true);

  it("chains kit operations: promote → project → rename → proof.parse", () => {
    const out = pipe(
      UserDetailShape.create({
        id: "u-1",
        email: "alex@example.com",
        displayName: "Alex",
        isVerified: true,
        address: { street: "Via Roma 1", city: "Firenze" },
        avatarSrc: "https://cdn.example/avatar.png",
      }),
      (d) => UserDetailShape.project(d, UserKit),
      (u) => UserKit.rename(u, "Alex Renamed"),
      (u) => VerifiedUserFact.parse(u)
    );

    expect(out.displayName).toBe("Alex Renamed");
    expect(out.isVerified).toBe(true);
    expect(UserKit.is(out)).toBe(true);
    expect(VerifiedUserFact.is(out)).toBe(true);
    expectTypeOf(out.isVerified).toEqualTypeOf<true>();
  });
});

describe("pipe with stacked proof.parse", () => {
  const ItemSchema = z.object({
    type: z.literal("Item").default("Item"),
    id: z.string(),
    count: z.number().int().nonnegative(),
    tier: z.enum(["free", "pro"]),
    active: z.boolean(),
  });

  const ItemShape = branded.shape("Item", ItemSchema);

  const Stocked = branded.proof(
    "Stocked",
    ItemSchema.refine((v) => v.count > 0)
  );

  const ProTier = branded
    .proof("ProTier", ItemSchema)
    .refineType<{ tier: "pro" }>((row) => row.tier === "pro");

  const Active = branded
    .proof("Active", ItemSchema)
    .refineType<{ active: true }>((row) => row.active === true);

  it("sums guarantees: each proof applies in order; value satisfies every proof and narrowed fields", () => {
    const item = ItemShape.create({
      id: "it-1",
      count: 12,
      tier: "pro",
      active: true,
    });

    const out = pipe(item, Stocked.parse, ProTier.parse, Active.parse);

    expect(out.id).toBe("it-1");
    expect(out.count).toBe(12);
    expect(ItemShape.is(out)).toBe(true);
    expect(Stocked.is(out)).toBe(true);
    expect(ProTier.is(out)).toBe(true);
    expect(Active.is(out)).toBe(true);
    expect(out.tier).toBe("pro");
    expectTypeOf(out.active).toEqualTypeOf<true>();
    expectTypeOf(out.tier).toEqualTypeOf<"pro">();
  });

  it("fails at the first proof that does not hold", () => {
    const emptyStock = ItemShape.create({
      id: "it-0",
      count: 0,
      tier: "pro",
      active: true,
    });

    expect(() => pipe(emptyStock, Stocked.parse, ProTier.parse, Active.parse)).toThrow(
      BrandedValidationError
    );
  });
});
