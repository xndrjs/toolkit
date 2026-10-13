import { describe, expect, it } from "vitest";
import { z } from "zod";

import { domain, DomainValidationError } from "./index";

describe("@xndrjs/domain-zod integration", () => {
  it("primitive + Zod schema", () => {
    const Email = domain.primitive(
      "Email",
      z
        .string()
        .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
        .transform((v) => v.toLowerCase())
    );
    expect(Email.create("USER@EXAMPLE.COM")).toBe("user@example.com");
    expect(() => Email.create("not-email")).toThrow(DomainValidationError);
  });

  it("shape + Zod schema: frozen instance and is()", () => {
    const Item = domain.shape(
      "Item",
      z.object({
        type: z.literal("Item").default("Item"),
        id: z.string(),
        count: z.number().int().nonnegative(),
      })
    );
    const item = Item.create({ id: "x", count: 1 });
    expect(item.type).toBe("Item");
    expect(item.count).toBe(1);
    expect(Object.isFrozen(item)).toBe(true);
    expect(Item.is(item)).toBe(true);
  });

  it("proof + Zod schema merges onto shape instance", () => {
    const Item = domain.shape(
      "Item",
      z.object({
        type: z.literal("Item").default("Item"),
        id: z.string(),
        count: z.number().int().nonnegative(),
      })
    );
    const NonNegative = domain.proof(
      "NonNegative",
      z.object({
        id: z.string(),
        count: z.number().int().nonnegative(),
      })
    );
    const item = Item.create({ id: "a", count: 2 });
    const proven = NonNegative.assert(item);
    expect(proven.id).toBe("a");
    expect(proven.type).toBe("Item");
    expect(NonNegative.test(proven)).toBe(true);
  });

  it("proof refineType + Zod schema", () => {
    const Verified = domain
      .proof("Verified", z.object({ isVerified: z.boolean() }))
      .refineType((row): row is typeof row & { isVerified: true } => row.isVerified === true);

    const row = Verified.assert({ isVerified: true });
    expect(row.isVerified).toBe(true);
    expect(() => Verified.assert({ isVerified: false })).toThrow(DomainValidationError);
  });

  it("capabilities + Zod schema: kit methods and patch re-validation", () => {
    const UserShape = domain.shape(
      "User",
      z.object({
        type: z.literal("User").default("User"),
        email: z.string().min(1),
        isVerified: z.boolean(),
      })
    );

    const User = domain.capabilities.forShapeKit(UserShape).methods(({ patch }) => ({
      markVerified(user) {
        return patch(user, { isVerified: true });
      },
    }));

    const user = UserShape.create({ email: "a@b.co", isVerified: false });
    const next = User.markVerified(user);
    expect(next.isVerified).toBe(true);
    expect(UserShape.is(next)).toBe(true);
    expect(Object.keys(next as object)).not.toContain("markVerified");
  });

  it("shape create surfaces DomainValidationError with zod failure in error.raw", () => {
    const Item = domain.shape("Item", z.object({ id: z.string() }));
    try {
      Item.create({} as { id: string });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DomainValidationError);
      const err = e as InstanceType<typeof DomainValidationError>;
      expect(err.failure.engine).toBe("zod");
      expect(err.failure.raw).toBeDefined();
    }
  });
});
