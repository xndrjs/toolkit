import { describe, expect, it } from "vitest";
import { z } from "zod";

import { capabilities, DomainValidationError, fromZod, primitive, proof, shape } from "./index";

describe("@xndrjs/domain-zod integration", () => {
  it("primitive + fromZod", () => {
    const Email = primitive(
      "Email",
      fromZod(
        z
          .string()
          .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)
          .transform((v) => v.toLowerCase())
      )
    );
    expect(Email.create("USER@EXAMPLE.COM")).toBe("user@example.com");
    expect(() => Email.create("not-email")).toThrow(DomainValidationError);
  });

  it("shape + fromZod: frozen instance and is()", () => {
    const Item = shape(
      "Item",
      fromZod(
        z.object({
          type: z.literal("Item").default("Item"),
          id: z.string(),
          count: z.number().int().nonnegative(),
        })
      )
    );
    const item = Item.create({ id: "x", count: 1 });
    expect(item.type).toBe("Item");
    expect(item.count).toBe(1);
    expect(Object.isFrozen(item)).toBe(true);
    expect(Item.is(item)).toBe(true);
  });

  it("proof + fromZod merges onto shape instance", () => {
    const Item = shape(
      "Item",
      fromZod(
        z.object({
          type: z.literal("Item").default("Item"),
          id: z.string(),
          count: z.number().int().nonnegative(),
        })
      )
    );
    const NonNegative = proof(
      "NonNegative",
      fromZod(
        z.object({
          id: z.string(),
          count: z.number().int().nonnegative(),
        })
      )
    );
    const item = Item.create({ id: "a", count: 2 });
    const proven = NonNegative.assert(item);
    expect(proven.id).toBe("a");
    expect(proven.type).toBe("Item");
    expect(NonNegative.test(proven)).toBe(true);
  });

  it("proof refineType + fromZod", () => {
    const Verified = proof("Verified", fromZod(z.object({ isVerified: z.boolean() }))).refineType<{
      isVerified: true;
    }>((row): row is typeof row & { isVerified: true } => row.isVerified === true);

    const row = Verified.assert({ isVerified: true });
    expect(row.isVerified).toBe(true);
    expect(() => Verified.assert({ isVerified: false })).toThrow(DomainValidationError);
  });

  it("capabilities + fromZod: kit methods and patch re-validation", () => {
    const UserShape = shape(
      "User",
      fromZod(
        z.object({
          type: z.literal("User").default("User"),
          email: z.string().min(1),
          isVerified: z.boolean(),
        })
      )
    );

    const User = capabilities<{ email: string; isVerified: boolean }>()
      .methods((patch) => ({
        markVerified(user) {
          return patch(user, { isVerified: true });
        },
      }))
      .attach(UserShape);

    const user = User.create({ email: "a@b.co", isVerified: false });
    const next = User.markVerified(user);
    expect(next.isVerified).toBe(true);
    expect(User.is(next)).toBe(true);
    expect(Object.keys(next as object)).not.toContain("markVerified");
  });

  it("shape create surfaces DomainValidationError with zod failure in error.raw", () => {
    const Item = shape("Item", fromZod(z.object({ id: z.string() })));
    try {
      Item.create({} as { id: string });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DomainValidationError);
      const err = e as DomainValidationError;
      expect(err.failure.engine).toBe("zod");
      expect(err.failure.raw).toBeDefined();
    }
  });
});
