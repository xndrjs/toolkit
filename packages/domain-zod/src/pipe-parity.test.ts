import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { domain, DomainValidationError, pipe, zodToValidator } from "./index";

describe("pipe parity (branded pipe.branded.test)", () => {
  const UserSchema = z.object({
    type: z.literal("User").default("User"),
    id: z.string(),
    email: z.email(),
    displayName: z.string(),
    isVerified: z.boolean(),
    address: z.object({
      type: z.literal("Address").default("Address"),
      city: z.string(),
      street: z.string(),
    }),
  });

  const UserShape = domain.shape("User", zodToValidator(UserSchema));
  const UserKit = domain
    .capabilities<z.output<typeof UserSchema>>()
    .methods((patch) => ({
      rename(user, displayName: string) {
        return patch(user, { displayName });
      },
    }))
    .attach(UserShape);

  const UserDetailSchema = UserSchema.extend({
    avatarSrc: z.string().url(),
  });

  const UserDetailShape = domain.shape("UserDetail", zodToValidator(UserDetailSchema));

  const VerifiedUserFact = domain
    .proof("VerifiedUser", zodToValidator(z.object({ isVerified: z.boolean() })))
    .refineType<{
      isVerified: true;
    }>((row): row is typeof row & { isVerified: true } => row.isVerified === true);

  it("chains: create detail → project → rename → proof.assert", () => {
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
      VerifiedUserFact.assert
    );

    expect(out.displayName).toBe("Alex Renamed");
    expect(out.isVerified).toBe(true);
    expect(UserKit.is(out)).toBe(true);
    expect(VerifiedUserFact.test(out)).toBe(true);
    expectTypeOf(out.isVerified).toEqualTypeOf<true>();
  });
});

describe("stacked proofs (branded pipe.branded.test)", () => {
  const ItemSchema = z.object({
    type: z.literal("Item").default("Item"),
    id: z.string(),
    count: z.number().int().nonnegative(),
    tier: z.enum(["free", "pro"]),
    active: z.boolean(),
  });

  const ItemShape = domain.shape("Item", zodToValidator(ItemSchema));

  const Stocked = domain.proof("Stocked", zodToValidator(ItemSchema.refine((v) => v.count > 0)));

  const ProTier = domain
    .proof("ProTier", zodToValidator(ItemSchema))
    .refineType<{ tier: "pro" }>((row): row is typeof row & { tier: "pro" } => row.tier === "pro");

  const Active = domain.proof("Active", zodToValidator(ItemSchema)).refineType<{
    active: true;
  }>((row): row is typeof row & { active: true } => row.active === true);

  it("applies each proof in order; value satisfies all narrowed checks", () => {
    const item = ItemShape.create({
      id: "it-1",
      count: 12,
      tier: "pro",
      active: true,
    });

    const out = pipe(item, Stocked.assert, ProTier.assert, Active.assert);

    expect(out.id).toBe("it-1");
    expect(out.count).toBe(12);
    expect(ItemShape.is(out)).toBe(true);
    expect(Stocked.test(out)).toBe(true);
    expect(ProTier.test(out)).toBe(true);
    expect(Active.test(out)).toBe(true);
    expect(out.tier).toBe("pro");
    expectTypeOf(out.active).toEqualTypeOf<true>();
    expectTypeOf(out.tier).toEqualTypeOf<"pro">();
  });

  it("fails at first proof that does not hold", () => {
    const emptyStock = ItemShape.create({
      id: "it-0",
      count: 0,
      tier: "pro",
      active: true,
    });

    expect(() => pipe(emptyStock, Stocked.assert, ProTier.assert, Active.assert)).toThrow(
      DomainValidationError
    );
  });
});
