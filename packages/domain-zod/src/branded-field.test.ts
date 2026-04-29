import { describe, expect, it } from "vitest";
import { z } from "zod";

import { domainZod } from "./index";

describe("domainZod.field", () => {
  it("embeds Zod-backed primitive: raw or pre-created input, nominal output", () => {
    const Email = domainZod.primitive("Email", z.string().email());
    const Row = z.object({
      email: domainZod.field(Email),
    });

    const fromRaw = Row.parse({ email: "a@b.co" });
    expect(Email.is(fromRaw.email)).toBe(true);

    const existing = Email.create("c@d.co");
    const fromBranded = Row.parse({ email: existing });
    expect(fromBranded.email).toBe(existing);
    expect(Email.is(fromBranded.email)).toBe(true);
  });

  it("embeds Zod-backed shape: output passes child is()", () => {
    const InnerSchema = z.object({ type: z.literal("Inner").default("Inner"), n: z.number() });
    const Inner = domainZod.shape("Inner", InnerSchema);
    const Row = z.object({
      inner: domainZod.field(Inner),
    });

    const row = Row.parse({ inner: { n: 1 } });
    expect(Inner.is(row.inner)).toBe(true);
  });

  it("still allows explicit schema + kit when needed", () => {
    const Email = domainZod.primitive("Email", z.string().email());
    const Row = z.object({
      email: domainZod.brandedField(z.string().email().toLowerCase(), Email),
    });
    const row = Row.parse({ email: "A@B.CO" });
    expect(row.email).toBe("a@b.co");
    expect(Email.is(row.email)).toBe(true);
  });
});
