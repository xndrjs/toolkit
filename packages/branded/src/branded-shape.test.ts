import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { branded } from "./api";
import { BrandedType } from "./types";
import { BrandedValidationError } from "./errors";

// --- Example domain ---

// Email value object

const EmailPrimitive = branded.primitive("Email", z.string().min(1));

type Email = BrandedType<typeof EmailPrimitive>;

// Address entity / composite VO

const [AddressShape, _patchAddress] = branded.shape("Address", {
  schema: z.object({
    type: z.literal("Address").default("Address"),
    city: z.string(),
    street: z.string(),
  }),
  methods: {},
});

// User aggregate

const UserShapeSchema = z.object({
  type: z.literal("User").default("User"),
  email: branded.field(EmailPrimitive),
  address: branded.field(AddressShape),
});

const [User, patchUser] = branded.shape("User", {
  schema: UserShapeSchema,
  methods: {
    isCorporate() {
      return this.email.endsWith("@company.com");
    },
    /** Semantic patch: preserves receiver refinement type when delta is refinement-safe (`as T` via polymorphic surface). */
    patchEmail(email: Email) {
      return patchUser(this, { email });
    },
  },
});

type UserEntity = BrandedType<typeof User>;

// --- Tests ---

describe("branded-kit example domain", () => {
  it("creates Email, Address, and User with schema discriminant + shape prototype", () => {
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
    expect(user.isCorporate()).toBe(false);
    expect(Object.isFrozen(user)).toBe(true);
    expect(User.is(user)).toBe(true);
  });

  it("keeps methods on prototype, so they are not copied by spread/json", () => {
    const user = User.create({
      email: "alice@company.com",
      address: { street: "Via Roma 1", city: "Firenze" },
    });

    expect(user.isCorporate()).toBe(true);
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

  it("patchUser patches email and re-validates", () => {
    const user = User.create({
      email: EmailPrimitive.create("a@b.c"),
      address: AddressShape.create({ street: "Old", city: "F" }),
    });
    const next = user.patchEmail(EmailPrimitive.create("new@b.c"));
    expect(next.email).toBe("new@b.c");
    expect(next.address).toEqual(user.address);
    expect(next.type).toBe("User");
    expect(next.isCorporate()).toBe(false);
    expect(User.is(next)).toBe(true);
  });

  it("patchUser rejects invalid delta via Zod", () => {
    const user = User.create({
      email: EmailPrimitive.create("ok@b.c"),
      address: AddressShape.create({ street: "S", city: "F" }),
    });
    expect(() => patchUser(user as UserEntity, { email: "" as unknown as Email })).toThrow(
      BrandedValidationError
    );
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

  it("patches User address from raw nested value", () => {
    const user = User.create({
      email: "email@test.com",
      address: { street: "old street", city: "F" },
    });

    const next = patchUser(user, {
      address: { street: "new street", city: "F" },
    });

    expect(next.address.street).toBe("new street");
    expect(AddressShape.is(next.address)).toBe(true);
  });

  it("patch callback mutating nested fields does not mutate the original entity", () => {
    const user = User.create({
      email: "email@test.com",
      address: { street: "Via Roma", city: "Firenze" },
    });
    const addressBefore = user.address;
    expect(addressBefore.city).toBe("Firenze");

    const next = patchUser(user, (draft) => {
      draft.address.city = "Milano";
    });

    expect(next.address.city).toBe("Milano");
    expect(user.address.city).toBe("Firenze");
    expect(user.address).toBe(addressBefore);
  });

  it("patch object delta does not mutate nested objects on the original entity", () => {
    const user = User.create({
      email: "email@test.com",
      address: { street: "Old", city: "F" },
    });
    const streetBefore = user.address.street;

    const next = patchUser(user, {
      address: { street: "New", city: "F" },
    });

    expect(next.address.street).toBe("New");
    expect(user.address.street).toBe(streetBefore);
    expect(user.address.street).toBe("Old");
  });

  it("patch rejects draft when schema discriminant no longer matches", () => {
    const [WidgetShape, patchWidget] = branded.shape("Widget", {
      schema: z.object({
        type: z.literal("Widget").default("Widget"),
        name: z.string(),
      }),
      methods: {},
    });
    const w = WidgetShape.create({ name: "a" });
    expect(() =>
      patchWidget(w, (draft) => {
        draft.name = "b";
        (draft as { type?: string }).type = "Malicious";
      })
    ).toThrow(BrandedValidationError);
    const next = patchWidget(w, { name: "b" });
    expect(next.type).toBe("Widget");
    expect(next.name).toBe("b");
  });

  it("extends shape with explicit methods only (no inherited methods)", () => {
    const [UserDetailShape, patchUserDetail] = User.extend("UserDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        avatarSrc: z.string().min(1),
      }),
      methods: {},
    }));
    const [UserDetailShapeWithMethods, patchUserDetailWithMethods] = User.extend(
      "UserDetailWithMethods",
      (baseSchema) => ({
        schema: baseSchema.extend({
          avatarSrc: z.string().min(1),
        }),
        methods: {
          hasAvatar() {
            return this.avatarSrc.length > 0;
          },
        },
      })
    );

    const detail = UserDetailShapeWithMethods.create({
      email: "a@company.com",
      address: { street: "Via", city: "Firenze" },
      avatarSrc: "https://cdn.local/avatar.png",
    });

    expect(detail.type).toBe("User");
    expect(detail.avatarSrc).toBe("https://cdn.local/avatar.png");
    expect(detail.hasAvatar()).toBe(true);
    expect("isCorporate" in detail).toBe(false);
    expect(UserDetailShapeWithMethods.is(detail)).toBe(true);
    expect(User.is(detail)).toBe(false);

    const next = patchUserDetailWithMethods(detail, { avatarSrc: "https://cdn.local/next.png" });
    expect(next.avatarSrc).toBe("https://cdn.local/next.png");
    expect(next.hasAvatar()).toBe(true);
    expect(UserDetailShape.is(detail)).toBe(false);
    expect(typeof patchUserDetail).toBe("function");
  });

  it("extends shape with explicit composition from base methods", () => {
    const [UserDetailShape] = User.extend("UserDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        avatarSrc: z.string(),
      }),
      methods: (baseMethods) => ({
        isCorporate: baseMethods.isCorporate,
        hasAvatar(this: { avatarSrc: string }) {
          return this.avatarSrc.length > 0;
        },
      }),
    }));
    const detail = UserDetailShape.create({
      email: "a@company.com",
      address: { street: "Via", city: "Firenze" },
      avatarSrc: "x",
    });
    expect(detail.isCorporate()).toBe(true);
    expect(detail.hasAvatar()).toBe(true);
  });

  it("projects an extended shape instance to a base shape instance", () => {
    const [UserDetailShape] = User.extend("UserDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        avatarSrc: z.string().min(1),
      }),
      methods: {},
    }));
    const detail = UserDetailShape.create({
      email: "a@company.com",
      address: { street: "Via", city: "Firenze" },
      avatarSrc: "https://cdn.local/avatar.png",
    });
    const projected = detail.project(User);
    expect(projected.type).toBe("User");
    expect(projected.isCorporate()).toBe(true);
    expect(User.is(projected)).toBe(true);
    expect(UserDetailShape.is(projected)).toBe(false);
  });

  it("project throws when target shape input is incompatible", () => {
    const [AddressDetailShape] = AddressShape.extend("AddressDetail", (baseSchema) => ({
      schema: baseSchema.extend({
        county: z.string().min(1),
      }),
      methods: {},
    }));
    const detail = AddressDetailShape.create({
      street: "Via",
      city: "Firenze",
      county: "FI",
    });
    // @ts-expect-error -- compile-time incompatibility: AddressDetail cannot project to User input
    const _invalidProjectionTarget: Parameters<typeof detail.project>[0] = User;
    expect(_invalidProjectionTarget).toBeDefined();
    expect(() => (detail.project as (target: unknown) => unknown)(User)).toThrow(
      BrandedValidationError
    );
  });

  it("rejects reserved project method on shape and extension", () => {
    expect(() =>
      branded.shape("Illegal", {
        schema: z.object({
          id: z.string(),
        }),
        methods: {
          project() {
            return this;
          },
        },
      })
    ).toThrow(TypeError);

    expect(() =>
      User.extend("IllegalChild", (baseSchema) => ({
        schema: baseSchema.extend({
          extra: z.string(),
        }),
        methods: {
          project() {
            return this;
          },
        },
      }))
    ).toThrow(TypeError);
  });

  it("base method reused in extended shape returns extended type", () => {
    const [AccountShape, patchAccount] = branded.shape("Account", {
      schema: z.object({
        type: z.literal("Account").default("Account"),
        username: z.string().min(1),
      }),
      methods: {
        renameUsername(nextUsername: string) {
          return patchAccount(this, { username: nextUsername });
        },
      },
    });
    type Account = BrandedType<typeof AccountShape>;

    const [AccountDetailShape] = AccountShape.extend(
      "AccountDetail",
      (baseSchema, baseMethods) => ({
        schema: baseSchema.extend({
          avatarSrc: z.string().min(1).optional(),
        }),
        methods: {
          renameUsername: baseMethods.renameUsername,
        },
      })
    );

    const detail = AccountDetailShape.create({
      username: "alpha",
      avatarSrc: "https://cdn.local/avatar.png",
    });
    const renamed = detail.renameUsername("beta");
    type AccountDetail = BrandedType<typeof AccountDetailShape>;

    expectTypeOf(renamed).toEqualTypeOf<Account>();
    expectTypeOf(renamed).not.toEqualTypeOf<AccountDetail>();

    expect(AccountDetailShape.is(renamed)).toBe(true);
    expect("avatarSrc" in renamed).toBe(false);
    expect(renamed.username).toBe("beta");
  });

  it("base method reused in extended shape + explicit conversion", () => {
    const [AccountShape, patchAccount] = branded.shape("Account", {
      schema: z.object({
        type: z.literal("Account").default("Account"),
        username: z.string().min(1),
      }),
      methods: {
        renameUsername(nextUsername: string) {
          return patchAccount(this, { username: nextUsername });
        },
      },
    });
    type Account = BrandedType<typeof AccountShape>;

    const [AccountDetailShape] = AccountShape.extend(
      "AccountDetail",
      (baseSchema, baseMethods) => ({
        schema: baseSchema.extend({
          avatarSrc: z.string().min(1).optional(),
        }),
        methods: {
          renameUsername(nextUsername: string) {
            return AccountDetailShape.create(baseMethods.renameUsername.call(this, nextUsername));
          },
        },
      })
    );

    const detail = AccountDetailShape.create({
      username: "alpha",
      avatarSrc: "https://cdn.local/avatar.png",
    });
    const renamed = detail.renameUsername("beta");
    type AccountDetail = BrandedType<typeof AccountDetailShape>;

    expectTypeOf(renamed).not.toEqualTypeOf<Account>();
    expectTypeOf(renamed).toEqualTypeOf<AccountDetail>();

    expect(AccountDetailShape.is(renamed)).toBe(true);
    expect("avatarSrc" in renamed).toBe(false);
    expect(renamed.username).toBe("beta");
  });
});
