import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { branded } from "./api";
import { BrandedType, Mutable } from "./types";
import { BrandedValidationError } from "./errors";

// --- Example domain ---

// Email value object

const EmailPrimitive = branded.primitive("Email", z.string().min(1));

type Email = BrandedType<typeof EmailPrimitive>;

// Address entity / composite VO

const AddressShape = branded.shape(
  "Address",
  z.object({
    type: z.literal("Address").default("Address"),
    city: z.string(),
    street: z.string(),
  })
);

// User aggregate

const UserShapeSchema = z.object({
  type: z.literal("User").default("User"),
  email: branded.field(EmailPrimitive),
  address: branded.field(AddressShape),
});

const UserShape = branded.shape("User", UserShapeSchema);

const UserCapabilities = branded
  .capabilities<z.infer<typeof UserShapeSchema>>()
  .methods((patch) => ({
    isCorporate(user) {
      return user.email.endsWith("@company.com");
    },
    patchEmail(user, email: Email) {
      return patch(user, { email });
    },
  }));

const User = UserCapabilities.attach(UserShape);

// --- Tests ---

describe("branded-kit example domain", () => {
  it("creates Email, Address, and User with schema discriminant + shape marker prototype", () => {
    const email = EmailPrimitive.create("ciao");
    const address = AddressShape.create({ street: "Via Roma 1", city: "Firenze" });
    const user = User.create({ email, address });

    expect(email).toBe("ciao");
    expect(EmailPrimitive.is(email)).toBe(true);

    expect(address.type).toBe("Address");
    expect(address.street).toBe("Via Roma 1");
    expect(AddressShape.is(address)).toBe(true);

    expect(user.type).toBe("User");
    expect(user.email).toBe(email);
    expect(user.address).toEqual(address);
    expect(User.isCorporate(user)).toBe(false);
    expect(Object.isFrozen(user)).toBe(true);
    expect(User.is(user)).toBe(true);
  });

  it("keeps capabilities on the kit, so entity spread/json stays data-only", () => {
    const user = User.create({
      email: "alice@company.com",
      address: { street: "Via Roma 1", city: "Firenze" },
    });

    expect(User.isCorporate(user)).toBe(true);
    expect(Object.keys(user)).not.toContain("isCorporate");

    const spread = { ...user } as Record<string, unknown>;
    expect("isCorporate" in spread).toBe(false);

    const serialized = JSON.stringify(user);
    expect(serialized).not.toContain("isCorporate");
  });

  it("User.is rejects plain objects (wrong prototype) or wrong type even when Zod-shaped", () => {
    expect(
      User.is({
        type: "User",
        email: EmailPrimitive.create("x"),
        address: AddressShape.create({ street: "s", city: "F" }),
      })
    ).toBe(false);

    expect(User.is(User.create({ email: "x", address: { street: "s", city: "F" } }))).toBe(true);
  });

  it("patchEmail patches email and re-validates", () => {
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

  it("patchEmail rejects invalid value via Zod", () => {
    const user = User.create({
      email: EmailPrimitive.create("ok@b.c"),
      address: AddressShape.create({ street: "S", city: "F" }),
    });
    expect(() => User.patchEmail(user, "" as unknown as Email)).toThrow(BrandedValidationError);
  });

  it("shape validation errors expose zod issues", () => {
    try {
      User.create({
        email: "",
        address: { street: "Via", city: "F" },
      });
      throw new Error("Expected User.create to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BrandedValidationError);
      const validationError = error as BrandedValidationError;
      expect(validationError.issues.length).toBeGreaterThan(0);
      expect(validationError.zodError.issues.length).toBeGreaterThan(0);
    }
  });

  it("JSON round-trip loses shape prototype; is() is false until re-created via create()", () => {
    const user = User.create({
      email: EmailPrimitive.create("x"),
      address: AddressShape.create({ street: "y", city: "F" }),
    });
    const parsed = JSON.parse(JSON.stringify(user)) as unknown;
    expect(User.is(parsed)).toBe(false);
  });

  it("creates User directly from raw nested values", () => {
    const user = User.create({
      email: "email@test.com",
      address: { street: "via roma 1", city: "F" },
    });

    expect(user.type).toBe("User");
    expect(user.email).toBe("email@test.com");
    expect(EmailPrimitive.is(user.email)).toBe(true);
    expect(user.address.street).toBe("via roma 1");
    expect(AddressShape.is(user.address)).toBe(true);
    expect(User.is(user)).toBe(true);
  });

  it("patch rejects draft when schema discriminant no longer matches", () => {
    const widgetSchema = z.object({
      type: z.literal("Widget").default("Widget"),
      name: z.string(),
    });
    const WidgetShape = branded.shape("Widget", widgetSchema);
    const WidgetKit = branded
      .capabilities<z.output<typeof widgetSchema>>()
      .methods((patch) => ({
        setName(w, name: string) {
          return patch(w, { name });
        },
        applyDraft(w, fn: (draft: Mutable<z.input<typeof widgetSchema>>) => void) {
          return patch(w, fn);
        },
      }))
      .attach(WidgetShape);
    const w = WidgetKit.create({ name: "a" });
    expect(() =>
      WidgetKit.applyDraft(w, (draft) => {
        draft.name = "b";
        (draft as { type?: string }).type = "Malicious";
      })
    ).toThrow(BrandedValidationError);
    const next = WidgetKit.setName(w, "b");
    expect(next.type).toBe("Widget");
    expect(next.name).toBe("b");
  });

  it("extends shape with explicit methods only (no inherited methods)", () => {
    const UserDetailShape = User.extend("UserDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        avatarSrc: z.string().min(1),
      }),
    }));

    const UserDetailWithMethodsShape = User.extend("UserDetailWithMethods", (baseSchema) => ({
      schema: baseSchema.extend({
        avatarSrc: z.string().min(1),
      }),
    }));

    const UserDetailShapeWithMethodsKit = branded
      .capabilities<z.output<typeof UserDetailWithMethodsShape.schema>>()
      .methods((patch) => ({
        hasAvatar(user) {
          return user.avatarSrc.length > 0;
        },
        setAvatarSrc(user, src: string) {
          return patch(user, { avatarSrc: src });
        },
      }))
      .attach(UserDetailWithMethodsShape);

    const detail = UserDetailShapeWithMethodsKit.create({
      email: "a@company.com",
      address: { street: "Via", city: "Firenze" },
      avatarSrc: "https://cdn.local/avatar.png",
    });

    expect(detail.type).toBe("User");
    expect(detail.avatarSrc).toBe("https://cdn.local/avatar.png");
    expect(UserDetailShapeWithMethodsKit.hasAvatar(detail)).toBe(true);
    expect("isCorporate" in detail).toBe(false);
    expect(UserDetailShapeWithMethodsKit.is(detail)).toBe(true);
    expect(User.is(detail)).toBe(false);

    const next = UserDetailShapeWithMethodsKit.setAvatarSrc(detail, "https://cdn.local/next.png");
    expect(next.avatarSrc).toBe("https://cdn.local/next.png");
    expect(UserDetailShapeWithMethodsKit.hasAvatar(next)).toBe(true);
    expect(UserDetailShape.is(detail)).toBe(false);
  });

  it("extends shape with explicit composition from parent kit", () => {
    const UserDetailShape = User.extend("UserDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        avatarSrc: z.string(),
      }),
    }));

    const UserDetailKit = branded
      .capabilities<z.output<typeof UserDetailShape.schema>>()
      .methods(() => ({
        isCorporate: User.isCorporate,
        hasAvatar(user) {
          return user.avatarSrc.length > 0;
        },
      }))
      .attach(UserDetailShape);
    const detail = UserDetailKit.create({
      email: "a@company.com",
      address: { street: "Via", city: "Firenze" },
      avatarSrc: "x",
    });
    expect(UserDetailKit.isCorporate(detail)).toBe(true);
    expect(UserDetailKit.hasAvatar(detail)).toBe(true);
  });

  it("projects an extended shape instance to a base shape instance", () => {
    const UserDetailShape = User.extend("UserDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        avatarSrc: z.string().min(1),
      }),
    }));
    const detail = UserDetailShape.create({
      email: "a@company.com",
      address: { street: "Via", city: "Firenze" },
      avatarSrc: "https://cdn.local/avatar.png",
    });
    const projected = UserDetailShape.project(detail, User);
    expect(projected.type).toBe("User");
    expect(User.isCorporate(projected)).toBe(true);
    expect(User.is(projected)).toBe(true);
    expect(UserDetailShape.is(projected)).toBe(false);
  });

  it("project throws when target shape input is incompatible", () => {
    const AddressDetailShape = AddressShape.extend("AddressDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        county: z.string().min(1),
      }),
    }));
    const detail = AddressDetailShape.create({
      street: "Via",
      city: "Firenze",
      county: "FI",
    });
    // @ts-expect-error -- compile-time incompatibility: AddressDetail cannot project to User input
    const _invalidProjectionTarget: Parameters<typeof AddressDetailShape.project>[1] = User;
    expect(_invalidProjectionTarget).toBeDefined();
    expect(() =>
      (AddressDetailShape.project as (e: unknown, t: unknown) => unknown)(detail, User)
    ).toThrow(BrandedValidationError);
  });

  it("rejects reserved project method on shape and extension", () => {
    expect(() =>
      branded
        .capabilities<z.output<z.ZodObject<{ id: z.ZodString }>>>()
        .methods(() => ({
          project() {
            return null;
          },
        }))
        .attach(branded.shape("Illegal", z.object({ id: z.string() })))
    ).toThrow(TypeError);

    const IllegalChildShape = User.extend("IllegalChild", (baseSchema) => ({
      schema: baseSchema.extend({
        extra: z.string(),
      }),
    }));
    expect(() =>
      branded
        .capabilities<z.output<typeof IllegalChildShape.schema>>()
        .methods(() => ({
          project() {
            return null;
          },
        }))
        .attach(IllegalChildShape)
    ).toThrow(TypeError);
  });

  it("base method reused in extended shape returns extended type", () => {
    const AccountSchema = z.object({
      type: z.literal("Account").default("Account"),
      username: z.string().min(1),
    });

    const AccountCapabilities = branded
      .capabilities<z.output<typeof AccountSchema>>()
      .methods((patch) => ({
        renameUsername(user, nextUsername: string) {
          return patch(user, { username: nextUsername });
        },
      }));

    const AccountShape = branded.shape("Account", AccountSchema);
    const AccountKit = AccountCapabilities.attach(AccountShape);
    type Account = BrandedType<typeof AccountKit>;

    const AccountDetailShape = AccountKit.extend("AccountDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        avatarSrc: z.string().min(1).optional(),
      }),
    }));

    const AccountDetailKit = AccountCapabilities.attach(AccountDetailShape);

    const detail = AccountDetailKit.create({
      username: "alpha",
      avatarSrc: "https://cdn.local/avatar.png",
    });
    const renamed = AccountDetailKit.renameUsername(detail, "beta");
    type AccountDetail = BrandedType<typeof AccountDetailKit>;

    expectTypeOf(renamed).not.toEqualTypeOf<Account>();
    expectTypeOf(renamed).toEqualTypeOf<AccountDetail>();

    expect(AccountDetailKit.is(renamed)).toBe(true);
    expect("avatarSrc" in renamed).toBe(true);
    expect(renamed.username).toBe("beta");
  });

  it("base method reused in extended shape + explicit conversion", () => {
    const AccountSchema = z.object({
      type: z.literal("Account").default("Account"),
      username: z.string().min(1),
    });
    const AccountShape = branded.shape("Account", AccountSchema);

    const AccountCapabilities = branded
      .capabilities<z.output<typeof AccountSchema>>()
      .methods((patch) => ({
        renameUsername(user, nextUsername: string) {
          return patch(user, { username: nextUsername });
        },
      }));

    const AccountKit = AccountCapabilities.attach(AccountShape);

    const AccountDetailShape = AccountKit.extend("AccountDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        avatarSrc: z.string().min(1).optional(),
      }),
    }));

    const AccountDetailKit = AccountCapabilities.attach(AccountDetailShape);

    const detail = AccountDetailKit.create({
      username: "alpha",
      avatarSrc: "https://cdn.local/avatar.png",
    });
    const renamed = AccountDetailKit.renameUsername(detail, "beta");
    type AccountDetail = BrandedType<typeof AccountDetailKit>;

    expectTypeOf(renamed).toEqualTypeOf<AccountDetail>();

    expect(AccountDetailKit.is(renamed)).toBe(true);
    expect("avatarSrc" in renamed).toBe(true);
    expect(renamed.username).toBe("beta");
  });

  it("reusable capability can be attached to base and extended shapes", () => {
    const RenameCapability = branded.capabilities<{ displayName: string }>().methods((patch) => ({
      rename(entity, displayName: string) {
        return patch(entity, { displayName });
      },
    }));

    const ProfileShape = branded.shape(
      "Profile",
      z.object({
        type: z.literal("Profile").default("Profile"),
        displayName: z.string().min(1),
      })
    );
    const UserRenamingKit = RenameCapability.attach(ProfileShape);
    const UserDetailShape = ProfileShape.extend("ProfileDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        avatarSrc: z.string().min(1),
      }),
    }));
    const UserDetailRenamingKit = RenameCapability.attach(UserDetailShape);

    const user = UserRenamingKit.create({
      displayName: "Initial User Name",
    });
    const detail = UserDetailRenamingKit.create({
      displayName: "Initial Detail Name",
      avatarSrc: "https://cdn.local/avatar.png",
    });

    const renamedUser = UserRenamingKit.rename(user, "User Name");
    const renamedDetail = UserDetailRenamingKit.rename(detail, "Detail Name");

    expect(renamedUser.displayName).toBe("User Name");
    expect(UserRenamingKit.is(renamedUser)).toBe(true);

    expect(renamedDetail.displayName).toBe("Detail Name");
    expect(renamedDetail.avatarSrc).toBe("https://cdn.local/avatar.png");
    expect(UserDetailRenamingKit.is(renamedDetail)).toBe(true);
  });

  it("reusable capability enforces structural compatibility at attach time", () => {
    const RenameCapability = branded.capabilities<{ displayName: string }>().methods((patch) => ({
      rename<T extends { displayName: string }>(entity: T, displayName: string) {
        return patch(entity, { displayName });
      },
    }));

    const AnonymousShape = branded.shape(
      "Anonymous",
      z.object({
        type: z.literal("Anonymous").default("Anonymous"),
        nickname: z.string(),
      })
    );

    // @ts-expect-error -- schema row lacks `displayName`
    const _invalidAttach = RenameCapability.attach(AnonymousShape);
    expect(_invalidAttach).toBeDefined();
  });
});
