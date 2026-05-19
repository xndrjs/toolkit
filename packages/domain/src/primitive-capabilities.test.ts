import { describe, expect, it } from "vitest";

import { capabilities } from "./capabilities";
import { domain, DomainValidationError } from "./index";
import { primitive } from "./primitive";
import type { Validator } from "./validation";

/** Non-negative amount stored as integer minor units (e.g. cents). */
function moneyValidator(): Validator<number> {
  return {
    engine: "test",
    validate(input) {
      if (typeof input !== "number" || !Number.isInteger(input)) {
        return {
          success: false,
          error: {
            engine: "test",
            issues: [{ code: "invalid_type", path: [], message: "Expected integer cents" }],
          },
        };
      }
      if (input < 0) {
        return {
          success: false,
          error: {
            engine: "test",
            issues: [{ code: "negative", path: [], message: "Money cannot be negative" }],
          },
        };
      }
      return { success: true, data: input };
    },
  };
}

describe("capabilities.forPrimitive on domain.primitive", () => {
  const MoneyPrimitive = domain.primitive("Money", moneyValidator());

  const Money = domain.capabilities
    .forPrimitive<number>()
    .methods(({ create }) => ({
      add(money, cents: number) {
        return create(money + cents);
      },
      subtract(money, cents: number) {
        return create(money - cents);
      },
    }))
    .attach(MoneyPrimitive);

  it("attach exposes custom methods only; instances stay plain numbers", () => {
    const price = MoneyPrimitive.create(1_050);
    expect(price).toBe(1_050);
    expect(typeof price).toBe("number");

    const withTax = Money.add(price, 210);
    expect(withTax).toBe(1_260);
    expect(MoneyPrimitive.is(withTax)).toBe(true);
    expect(Object.hasOwn(withTax as unknown as object, "add")).toBe(false);
    expect(Money).not.toHaveProperty("create");
    expect(Money).not.toHaveProperty("is");
  });

  it("create in factory context re-validates the next scalar", () => {
    const wallet = MoneyPrimitive.create(500);
    expect(Money.add(wallet, 125)).toBe(625);

    const afterSpend = Money.subtract(wallet, 200);
    expect(afterSpend).toBe(300);

    expect(() => Money.subtract(wallet, 600)).toThrow(DomainValidationError);
    expect(() => MoneyPrimitive.create(10.5)).toThrow(DomainValidationError);
  });

  it("reusable primitive capability attaches to compatible primitives", () => {
    const AddCents = capabilities.forPrimitive<number>().methods(({ create }) => ({
      add(money, cents: number) {
        return create(money + cents);
      },
    }));

    const MoneyKit = AddCents.attach(MoneyPrimitive);
    const balance = MoneyPrimitive.create(1_000);
    expect(MoneyKit.add(balance, 50)).toBe(1_050);
  });

  it("attach enforces scalar contract at type level", () => {
    const AddCents = capabilities.forPrimitive<number>().methods(({ create }) => ({
      add(money, cents: number) {
        return create(money + cents);
      },
    }));

    const Sku = primitive("Sku", {
      engine: "test",
      validate(input) {
        if (typeof input !== "string" || input.length === 0) {
          return {
            success: false,
            error: {
              engine: "test",
              issues: [{ code: "invalid", path: [], message: "Expected non-empty SKU" }],
            },
          };
        }
        return { success: true, data: input };
      },
    });

    // @ts-expect-error -- string primitive does not extend number contract
    const _invalid = AddCents.attach(Sku);
    expect(_invalid).toBeDefined();
  });
});
