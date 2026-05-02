import { describe, expect, it } from "vitest";
import { z } from "zod";

import { domain, zodFromKit, zodToValidator } from "./index";

describe("zodFromKit", () => {
  it("embeds primitive from core+zodToValidator: raw or pre-created input", () => {
    const Email = domain.primitive("Email", zodToValidator(z.email()));
    const Row = z.object({
      email: zodFromKit(Email),
    });

    const fromRaw = Row.parse({ email: "a@b.co" });
    expect(Email.is(fromRaw.email)).toBe(true);

    const existing = Email.create("c@d.co");
    const fromBranded = Row.parse({ email: existing });
    expect(fromBranded.email).toBe(existing);
    expect(Email.is(fromBranded.email)).toBe(true);
  });

  it("embeds shape from core+zodToValidator: output passes child is()", () => {
    const InnerSchema = z.object({ type: z.literal("Inner").default("Inner"), n: z.number() });
    const Inner = domain.shape("Inner", zodToValidator(InnerSchema));
    const Row = z.object({
      inner: zodFromKit(Inner),
    });
    const Outer = domain.shape("Outer", zodToValidator(Row));

    // @ts-expect-error -- `inner` input comes from the kit input type (`{ n: number; type?: "Inner" }`)
    const _invalidRowInput: z.input<typeof Row> = { inner: { wrong: "arg" } };
    expect(_invalidRowInput).toBeDefined();
    const row = Row.parse({ inner: { n: 1 } });
    expect(Inner.is(row.inner)).toBe(true);
    Outer.create({ inner: { n: 0 } });
    // @ts-expect-error -- `inner` input comes from the kit input type (`{ n: number; type?: "Inner" }`)
    const wrong = Outer.safeCreate({ inner: { wrong: "arg" } });
    expect(wrong.success).toBe(false);
  });

  it("applies kit validator transforms when embedded (no parallel Zod chain)", () => {
    const Email = domain.primitive(
      "Email",
      zodToValidator(z.email().transform((v) => v.toLowerCase()))
    );
    const Row = z.object({
      email: zodFromKit(Email),
    });
    const row = Row.parse({ email: "A@B.CO" });
    expect(row.email).toBe("a@b.co");
    expect(Email.is(row.email)).toBe(true);
  });
});
