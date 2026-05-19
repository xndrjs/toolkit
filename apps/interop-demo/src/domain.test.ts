import { describe, expect, it } from "vitest";

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
    const verified = User.verify(
      User.rename(
        UserShape.create({
          email: "bob@example.com",
          displayName: "Bob",
          isVerified: false,
        }),
        "Robert"
      )
    );

    expect(verified.displayName).toBe("Robert");
    expect(verified.isVerified).toBe(true);
  });

  it("asserts VerifiedUser via core proof after Valibot-backed create", () => {
    const verified = User.verify(
      UserShape.create({
        email: "carol@example.com",
        displayName: "Carol",
        isVerified: false,
      })
    );

    expect(VerifiedUserProof.assert(verified)).toEqual(verified);
    expect(() =>
      VerifiedUserProof.assert(
        UserShape.create({
          email: "dave@example.com",
          displayName: "Dave",
          isVerified: false,
        })
      )
    ).toThrow();
  });

  it("uses core Money primitive with forPrimitive capabilities", () => {
    const wallet = MoneyPrimitive.create(1000);
    expect(Money.add(wallet, 250)).toBe(1250);
    expect(Money.subtract(wallet, 100)).toBe(900);
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

  it("projects User to UserContact using core compose shape", () => {
    const user = UserShape.create({
      email: "frank@example.com",
      displayName: "Frank",
      isVerified: true,
    });

    const contact = UserShape.project(user, UserContactShape);

    expect(contact).toEqual({
      email: "frank@example.com",
      displayName: "Frank",
    });
    expect(UserContactShape.is(contact)).toBe(true);
  });
});
