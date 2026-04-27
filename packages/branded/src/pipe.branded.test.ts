import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { branded } from "./api";
import { pipe } from "./pipe";

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
