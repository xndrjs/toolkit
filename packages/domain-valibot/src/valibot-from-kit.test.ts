import { describe, expect, it } from "vitest";
import * as v from "valibot";

import { domain, valibotFromKit, valibotToValidator } from "./index";

describe("valibotFromKit", () => {
  it("composes primitive kit inside valibot object schema", () => {
    const Email = domain.primitive("Email", valibotToValidator(v.pipe(v.string(), v.email())));

    const Row = v.object({
      email: valibotFromKit(Email),
    });

    const parsed = v.parse(Row, { email: "a@b.co" });
    expect(parsed.email).toBe("a@b.co");
    expect(Email.is(parsed.email)).toBe(true);
  });

  it("composes shape kit inside valibot object schema", () => {
    const Inner = domain.shape(
      "Inner",
      valibotToValidator(
        v.object({
          type: v.optional(v.literal("Inner"), "Inner"),
          n: v.number(),
        })
      )
    );

    const Row = v.object({
      inner: valibotFromKit(Inner),
    });

    const Outer = domain.shape("Outer", valibotToValidator(Row));

    // @ts-expect-error -- `inner` input comes from the kit input type (`{ n: number; type?: "Inner" }`)
    const _invalidRowInput: v.InferInput<typeof Row> = { inner: { wrong: "arg" } };
    expect(_invalidRowInput).toBeDefined();
    const parsed = v.parse(Row, { inner: { n: 1 } });
    expect(Inner.is(parsed.inner)).toBe(true);
    expect(parsed.inner.type).toBe("Inner");

    Outer.create({ inner: { n: 0 } });
    // @ts-expect-error -- `inner` input comes from the kit input type (`{ n: number; type?: "Inner" }`)
    const wrong = Outer.safeCreate({ inner: { wrong: "arg" } });
    expect(wrong.success).toBe(false);
  });
});
