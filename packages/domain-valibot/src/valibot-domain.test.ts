import { describe, expect, expectTypeOf, it } from "vitest";
import * as v from "valibot";

import { domain, valibotToValidator } from "./index";

describe("adapted domain (Valibot schemas)", () => {
  it("shape accepts a Valibot schema and matches domain.core + Validator path", () => {
    const schema = v.object({
      type: v.optional(v.literal("Item"), "Item"),
      id: v.string(),
    });
    const FromSchema = domain.shape("Item", schema);
    const FromValidator = domain.core.shape("Item", valibotToValidator(schema));

    const a = FromSchema.create({ id: "1" });
    const b = FromValidator.create({ id: "1" });
    expect(a.id).toBe("1");
    expect(b.id).toBe("1");
    expect(FromSchema.is(a)).toBe(true);
    expectTypeOf(a.id).toEqualTypeOf<string>();
  });

  it("primitive accepts a Valibot schema", () => {
    const Email = domain.primitive("Email", v.pipe(v.string(), v.email()));
    expect(Email.create("a@b.co")).toBe("a@b.co");
    expectTypeOf(Email.create("a@b.co")).toExtend<string>();
  });

  it("proof accepts a Valibot schema", () => {
    const Verified = domain
      .proof("Verified", v.object({ isVerified: v.boolean() }))
      .refineType((row): row is typeof row & { isVerified: true } => row.isVerified === true);

    expect(Verified.assert({ isVerified: true }).isVerified).toBe(true);
  });

  it("domain.core still accepts an explicit Validator", () => {
    const Item = domain.core.shape(
      "Item",
      valibotToValidator(
        v.object({
          id: v.string(),
          type: v.optional(v.literal("Item"), "Item"),
        })
      )
    );
    expect(Item.create({ id: "x" }).id).toBe("x");
  });
});
