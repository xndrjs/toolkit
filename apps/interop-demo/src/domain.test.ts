import { KitInstance, pipe } from "@xndrjs/domain";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  EmailPrimitive,
  Money,
  MoneyPrimitive,
  ProfileShape,
  User,
  UserContactShape,
  UserShape,
  VerifiedUserProof,
} from "./domain/index.js";

describe("workshop domain (mixed validators)", () => {
  it("normalizes email via the Zod primitive", () => {
    expect(EmailPrimitive.create("Alice@Example.COM")).toBe("alice@example.com");
    expect(EmailPrimitive.is("alice@example.com")).toBe(true);
    expect(EmailPrimitive.is("not-an-email")).toBe(false);
  });

  it("creates User from Valibot shape with nested Zod email kit", () => {
    const user = UserShape.create({
      email: "bob@example.com",
      displayName: "Bob",
      isVerified: false,
    });

    expect(user.type).toBe("User");
    expect(user.email).toBe("bob@example.com");
    expect(user.displayName).toBe("Bob");
    expect(user.isVerified).toBe(false);
  });

  it("applies forShape capabilities on User", () => {
    const verified = pipe(
      UserShape.create({
        email: "bob@example.com",
        displayName: "Bob",
        isVerified: false,
      }),
      (u) => User.rename(u, "Robert"),
      User.verify
    );

    expect(verified.displayName).toBe("Robert");
    expect(verified.isVerified).toBe(true);
  });

  it("asserts VerifiedUser via core proof after Valibot-backed create", () => {
    const verified = pipe(
      UserShape.create({
        email: "carol@example.com",
        displayName: "Carol",
        isVerified: false,
      }),
      User.verify
    );

    expect(VerifiedUserProof.assert(verified)).toEqual(verified);
    expect(() =>
      pipe(
        UserShape.create({
          email: "dave@example.com",
          displayName: "Dave",
          isVerified: false,
        }),
        VerifiedUserProof.assert
      )
    ).toThrow();
  });

  it("uses core Money primitive with forPrimitive capabilities", () => {
    const wallet = MoneyPrimitive.create(1000);
    expect(pipe(wallet, (w) => Money.add(w, 250))).toBe(1250);
    expect(pipe(wallet, (w) => Money.subtract(w, 100))).toBe(900);
    expect(() => MoneyPrimitive.create(-1)).toThrow();
  });

  it("builds Profile with Zod shape and shared Email kit", () => {
    const profile = ProfileShape.create({
      email: "Eve@Example.com",
      displayName: "Eve",
      isVerified: true,
    });

    expect(profile.type).toBe("Profile");
    expect(profile.email).toBe("eve@example.com");
    expect(profile.nickname).toBe("anonymous");
  });

  it("UserInstance rejects plain objects at the type level", () => {
    type UserInstance = KitInstance<typeof UserShape>;

    const verified = UserShape.create({
      email: "bob@example.com",
      displayName: "Bob",
      isVerified: false,
    });

    function acceptUser(u: UserInstance) {
      return u;
    }

    acceptUser(verified);

    acceptUser({
      displayName: "",
      isVerified: false,
      type: "User",
      // @ts-expect-error -- Email is not branded
      email: "",
    });

    const plain = {
      ...verified,
      // this remove the Email brand, now it's just a string
      email: "bobinvalidmail",
    };
    // @ts-expect-error -- plain object is not a UserShape kit instance
    acceptUser(plain);

    expectTypeOf(verified).toExtend<UserInstance>();
    expectTypeOf(plain).not.toExtend<UserInstance>();
    expect(UserShape.is(plain)).toBe(false);
    expect(UserShape.is(verified)).toBe(true);
  });

  it("projects User to UserContact using core compose shape", () => {
    const contact = pipe(
      UserShape.create({
        email: "frank@example.com",
        displayName: "Frank",
        isVerified: true,
      }),
      (u) => UserShape.project(u, UserContactShape)
    );

    expect(contact).toEqual({
      email: "frank@example.com",
      displayName: "Frank",
    });
    expect(UserContactShape.is(contact)).toBe(true);
  });
});
