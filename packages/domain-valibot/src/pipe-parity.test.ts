import { describe, expect, expectTypeOf, it } from "vitest";
import * as v from "valibot";

import { domain, DomainValidationError, pipe, valibotToValidator } from "./index";

describe("pipe parity (valibot)", () => {
  const UserSchema = v.object({
    type: v.optional(v.literal("User"), "User"),
    id: v.string(),
    email: v.pipe(v.string(), v.email()),
    displayName: v.string(),
    isVerified: v.boolean(),
    address: v.object({
      type: v.optional(v.literal("Address"), "Address"),
      city: v.string(),
      street: v.string(),
    }),
  });

  const UserShape = domain.shape("User", valibotToValidator(UserSchema));
  const UserKit = domain
    .capabilities<v.InferOutput<typeof UserSchema>>()
    .methods((patch) => ({
      rename(user, displayName: string) {
        return patch(user, { displayName });
      },
    }))
    .attach(UserShape);

  const UserDetailSchema = v.object({
    type: v.optional(v.literal("User"), "User"),
    id: v.string(),
    email: v.pipe(v.string(), v.email()),
    displayName: v.string(),
    isVerified: v.boolean(),
    address: v.object({
      type: v.optional(v.literal("Address"), "Address"),
      city: v.string(),
      street: v.string(),
    }),
    avatarSrc: v.pipe(v.string(), v.url()),
  });

  const UserDetailShape = domain.shape("UserDetail", valibotToValidator(UserDetailSchema));

  const VerifiedUserFact = domain
    .proof(
      "VerifiedUser",
      valibotToValidator(
        v.object({
          isVerified: v.boolean(),
        })
      )
    )
    .refineType((row): row is typeof row & { isVerified: true } => row.isVerified === true);

  it("chains: create detail -> project -> rename -> proof.assert", () => {
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

describe("stacked proofs (valibot)", () => {
  const ItemSchema = v.object({
    type: v.optional(v.literal("Item"), "Item"),
    id: v.string(),
    count: v.pipe(v.number(), v.integer(), v.minValue(0)),
    tier: v.picklist(["free", "pro"]),
    active: v.boolean(),
  });

  const ItemShape = domain.shape("Item", valibotToValidator(ItemSchema));

  const Stocked = domain.proof(
    "Stocked",
    valibotToValidator(
      v.pipe(
        ItemSchema,
        v.check((item) => item.count > 0, "count must be > 0")
      )
    )
  );

  const ProTier = domain
    .proof("ProTier", valibotToValidator(ItemSchema))
    .refineType((row): row is typeof row & { tier: "pro" } => row.tier === "pro");

  const Active = domain
    .proof("Active", valibotToValidator(ItemSchema))
    .refineType((row): row is typeof row & { active: true } => row.active === true);

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
