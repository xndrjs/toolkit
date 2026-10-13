import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { domain, zodToValidator } from "./index";

describe("adapted domain (Zod schemas)", () => {
  it("shape accepts a Zod schema and matches domain.core + Validator path", () => {
    const schema = z.object({
      type: z.literal("Item").default("Item"),
      id: z.string(),
    });
    const FromSchema = domain.shape("Item", schema);
    const FromValidator = domain.core.shape("Item", zodToValidator(schema));

    const a = FromSchema.create({ id: "1" });
    const b = FromValidator.create({ id: "1" });
    expect(a.id).toBe("1");
    expect(b.id).toBe("1");
    expect(FromSchema.is(a)).toBe(true);
    expectTypeOf(a.id).toEqualTypeOf<string>();
  });

  it("primitive accepts a Zod schema", () => {
    const Email = domain.primitive("Email", z.email());
    expect(Email.create("a@b.co")).toBe("a@b.co");
    expectTypeOf(Email.create("a@b.co")).toExtend<string>();
  });

  it("proof accepts a Zod schema", () => {
    const Verified = domain
      .proof("Verified", z.object({ isVerified: z.boolean() }))
      .refineType((row): row is typeof row & { isVerified: true } => row.isVerified === true);

    expect(Verified.assert({ isVerified: true }).isVerified).toBe(true);
  });

  it("domain.core still accepts an explicit Validator", () => {
    const Item = domain.core.shape(
      "Item",
      zodToValidator(z.object({ id: z.string(), type: z.literal("Item").default("Item") }))
    );
    expect(Item.create({ id: "x" }).id).toBe("x");
  });
});
