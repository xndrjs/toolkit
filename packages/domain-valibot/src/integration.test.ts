import { describe, expect, it } from "vitest";
import * as v from "valibot";

import { domain, DomainValidationError, valibotToValidator } from "./index";

describe("@xndrjs/domain-valibot integration", () => {
  it("primitive + fromValibot", () => {
    const Email = domain.primitive(
      "Email",
      valibotToValidator(
        v.pipe(
          v.string(),
          v.email(),
          v.transform((value) => value.toLowerCase())
        )
      )
    );
    expect(Email.create("USER@EXAMPLE.COM")).toBe("user@example.com");
    expect(() => Email.create("not-email")).toThrow(DomainValidationError);
  });

  it("shape + fromValibot: frozen instance and is()", () => {
    const Item = domain.shape(
      "Item",
      valibotToValidator(
        v.object({
          type: v.optional(v.literal("Item"), "Item"),
          id: v.string(),
          count: v.pipe(v.number(), v.integer(), v.minValue(0)),
        })
      )
    );
    const item = Item.create({ id: "x", count: 1 });
    expect(item.type).toBe("Item");
    expect(item.count).toBe(1);
    expect(Object.isFrozen(item)).toBe(true);
    expect(Item.is(item)).toBe(true);
  });

  it("capabilities + fromValibot: kit methods and patch re-validation", () => {
    const UserShape = domain.shape(
      "User",
      valibotToValidator(
        v.object({
          type: v.optional(v.literal("User"), "User"),
          email: v.pipe(v.string(), v.minLength(1)),
          isVerified: v.boolean(),
        })
      )
    );

    const User = domain
      .capabilities<{ email: string; isVerified: boolean }>()
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
  });
});
