import { describe, expect, it } from "vitest";
import * as v from "valibot";

import { domain, DomainValidationError, valibotFromKit, valibotToValidator } from "./index";

describe("aggregate domain parity (valibot)", () => {
  const EmailPrimitive = domain.primitive(
    "Email",
    valibotToValidator(v.pipe(v.string(), v.minLength(1)))
  );

  const AddressShape = domain.shape(
    "Address",
    valibotToValidator(
      v.object({
        type: v.optional(v.literal("Address"), "Address"),
        city: v.string(),
        street: v.string(),
      })
    )
  );

  const UserShapeSchema = v.object({
    type: v.optional(v.literal("User"), "User"),
    email: valibotFromKit(EmailPrimitive),
    address: valibotFromKit(AddressShape),
  });

  const UserShape = domain.shape("User", valibotToValidator(UserShapeSchema));

  const User = domain
    .capabilities<v.InferOutput<typeof UserShapeSchema>>()
    .methods((patch) => ({
      isCorporate(user) {
        return user.email.endsWith("@company.com");
      },
      patchEmail(user, email: ReturnType<typeof EmailPrimitive.create>) {
        return patch(user, { email });
      },
    }))
    .attach(UserShape);

  it("creates nested aggregate with discriminants and frozen user", () => {
    const email = EmailPrimitive.create("ciao");
    const address = AddressShape.create({ street: "Via Roma 1", city: "Firenze" });
    const user = User.create({ email, address });

    expect(email).toBe("ciao");
    expect(EmailPrimitive.is(email)).toBe(true);

    expect(address.type).toBe("Address");
    expect(AddressShape.is(address)).toBe(true);

    expect(user.type).toBe("User");
    expect(user.email).toBe(email);
    expect(user.address).toEqual(address);
    expect(User.isCorporate(user)).toBe(false);
    expect(Object.isFrozen(user)).toBe(true);
    expect(User.is(user)).toBe(true);
  });

  it("capabilities stay on kit; JSON is data-only", () => {
    const user = User.create({
      email: "alice@company.com",
      address: { street: "Via Roma 1", city: "Firenze" },
    });

    expect(User.isCorporate(user)).toBe(true);
    expect(Object.keys(user as object)).not.toContain("isCorporate");
    expect(JSON.stringify(user)).not.toContain("isCorporate");
  });

  it("User.is rejects plain object with same shape", () => {
    expect(
      User.is({
        type: "User",
        email: EmailPrimitive.create("x"),
        address: AddressShape.create({ street: "s", city: "F" }),
      })
    ).toBe(false);

    expect(User.is(User.create({ email: "x", address: { street: "s", city: "F" } }))).toBe(true);
  });

  it("patchEmail re-validates", () => {
    const user = User.create({
      email: EmailPrimitive.create("a@b.c"),
      address: AddressShape.create({ street: "Old", city: "F" }),
    });
    const next = User.patchEmail(user, EmailPrimitive.create("new@b.c"));
    expect(next.email).toBe("new@b.c");
    expect(next.address).toEqual(user.address);
    expect(next.type).toBe("User");
    expect(User.isCorporate(next)).toBe(false);
    expect(User.is(next)).toBe(true);
  });

  it("patchEmail rejects invalid email for schema", () => {
    const user = User.create({
      email: EmailPrimitive.create("ok@b.c"),
      address: AddressShape.create({ street: "S", city: "F" }),
    });
    expect(() =>
      User.patchEmail(user, "" as unknown as ReturnType<typeof EmailPrimitive.create>)
    ).toThrow(DomainValidationError);
  });

  it("create throws with issues on invalid nested input", () => {
    try {
      User.create({
        email: "",
        address: { street: "Via", city: "F" },
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DomainValidationError);
      expect((e as InstanceType<typeof DomainValidationError>).issues.length).toBeGreaterThan(0);
    }
  });

  it("JSON round-trip loses prototype", () => {
    const user = User.create({
      email: EmailPrimitive.create("x"),
      address: AddressShape.create({ street: "y", city: "F" }),
    });
    const parsed = JSON.parse(JSON.stringify(user)) as unknown;
    expect(User.is(parsed)).toBe(false);
  });

  it("creates user from raw nested literals", () => {
    const user = User.create({
      email: "email@test.com",
      address: { street: "via roma 1", city: "F" },
    });

    expect(user.type).toBe("User");
    expect(user.email).toBe("email@test.com");
    expect(EmailPrimitive.is(user.email)).toBe(true);
    expect(user.address.street).toBe("via roma 1");
    expect(user.address.type).toBe("Address");
    expect(AddressShape.is(user.address)).toBe(true);
    expect(User.is(user)).toBe(true);
  });
});
