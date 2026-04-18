import { describe, expect, it } from "vitest";
import { z } from "zod";

import { __brand } from "./private-constants";
import { branded } from "./api";
import { BrandedType } from "./types";
import { BrandedValidationError } from "./errors";

// --- Example domain ---

// Email value object

const EmailPrimitive = branded.primitive("Email", z.string().min(1));

type Email = BrandedType<typeof EmailPrimitive>;

// Address entity / composite VO

const [AddressShape, _patchAddress] = branded.shape(
  "Address",
  z.object({
    city: z.string(),
    street: z.string(),
  })
);

// User aggregate

const [UserShape, patchUser] = branded.shape(
  "User",
  z.object({
    email: branded.field(EmailPrimitive),
    address: branded.field(AddressShape),
  })
);

type User = BrandedType<typeof UserShape>;

function patchEmail(user: User, email: Email) {
  return patchUser(user, { email });
}

const UserSDK = {
  ...UserShape,
  patchEmail,
};

const Auth = {
  Email: EmailPrimitive,
  User: UserSDK,
  Address: AddressShape,
};

// --- Tests ---

describe("branded-kit example domain", () => {
  it("creates Email, Address, and User with runtime discriminant + brand", () => {
    const email = Auth.Email.create("ciao");
    const address = Auth.Address.create({ street: "Via Roma 1", city: "Firenze" });
    const user = Auth.User.create({ email, address });

    expect(email).toBe("ciao");
    expect(Auth.Email.is(email)).toBe(true);

    expect(address.type).toBe("Address");
    expect(address.street).toBe("Via Roma 1");
    expect(address[__brand]).toEqual({ Address: true });
    expect(Auth.Address.is(address)).toBe(true);

    expect(user.type).toBe("User");
    expect(user.email).toBe(email);
    expect(user.address).toEqual(address);
    expect(user[__brand]).toEqual({ User: true });
    expect(Object.isFrozen(user)).toBe(true);
    expect(Object.isFrozen(user[__brand])).toBe(true);
    expect(Auth.User.is(user)).toBe(true);
  });

  it("UserShape.is rejects plain objects without brand or wrong type", () => {
    expect(
      Auth.User.is({
        type: "User",
        email: Auth.Email.create("x"),
        address: Auth.Address.create({ street: "s", city: "F" }),
      })
    ).toBe(false);

    expect(
      Auth.User.is({
        email: Auth.Email.create("x"),
        address: Auth.Address.create({ street: "s", city: "F" }),
        type: "User",
        [__brand]: { User: true },
      })
    ).toBe(true);
  });

  it("patchUser patches email and re-validates", () => {
    const user = Auth.User.create({
      email: Auth.Email.create("a@b.c"),
      address: Auth.Address.create({ street: "Old", city: "F" }),
    });
    const next = patchEmail(user, Auth.Email.create("new@b.c"));
    expect(next.email).toBe("new@b.c");
    expect(next.address).toEqual(user.address);
    expect(next.type).toBe("User");
    expect(Auth.User.is(next)).toBe(true);
  });

  it("patchUser rejects invalid delta via Zod", () => {
    const user = Auth.User.create({
      email: Auth.Email.create("ok@b.c"),
      address: Auth.Address.create({ street: "S", city: "F" }),
    });
    expect(() => patchUser(user, { email: "" as unknown as Email })).toThrow(
      BrandedValidationError
    );
  });

  it("shape validation errors expose zod issues", () => {
    try {
      Auth.User.create({
        email: "",
        address: { street: "Via", city: "F" },
      });
      throw new Error("Expected Auth.User.create to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BrandedValidationError);
      const validationError = error as BrandedValidationError;
      expect(validationError.issues.length).toBeGreaterThan(0);
      expect(validationError.zodError.issues.length).toBeGreaterThan(0);
    }
  });

  it("JSON round-trip drops symbol brand; is() is false until re-hydrated", () => {
    const user = Auth.User.create({
      email: Auth.Email.create("x"),
      address: Auth.Address.create({ street: "y", city: "F" }),
    });
    const parsed = JSON.parse(JSON.stringify(user)) as unknown;
    expect(Auth.User.is(parsed)).toBe(false);
  });

  it("creates User directly from raw nested values", () => {
    const user = Auth.User.create({
      email: "email@test.com",
      address: { street: "via roma 1", city: "F" },
    });

    expect(user.type).toBe("User");
    expect(user.email).toBe("email@test.com");
    expect(Auth.Email.is(user.email)).toBe(true);
    expect(user.address.street).toBe("via roma 1");
    expect(Auth.Address.is(user.address)).toBe(true);
    expect(Auth.User.is(user)).toBe(true);
  });

  it("patches User address from raw nested value", () => {
    const user = Auth.User.create({
      email: "email@test.com",
      address: { street: "old street", city: "F" },
    });

    const next = patchUser(user, {
      address: { street: "new street", city: "F" },
    });

    expect(next.address.street).toBe("new street");
    expect(Auth.Address.is(next.address)).toBe(true);
  });

  it("patch ignores tampered type and __brand before re-validation", () => {
    const [WidgetShape, patchWidget] = branded.shape("Widget", z.object({ name: z.string() }));
    const w = WidgetShape.create({ name: "a" });
    const next = patchWidget(w, (draft) => {
      draft.name = "b";
      (draft as { type?: string }).type = "Malicious";
      Reflect.set(draft, __brand, { Fake: true });
    });
    expect(next.type).toBe("Widget");
    expect(next[__brand]).toEqual({ Widget: true });
    expect(next.name).toBe("b");
  });
});
