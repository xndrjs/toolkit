import { describe, expect, expectTypeOf, it } from "vitest";

import { s, safeParse, type InferKeySchema } from "./key-schema";

describe("key schema DSL", () => {
  it("parses leaf schemas", () => {
    expect(safeParse(s.string(), "ok")).toEqual({ success: true, data: "ok" });
    expect(safeParse(s.int(), 3)).toEqual({ success: true, data: 3 });
    expect(safeParse(s.boolean(), false)).toEqual({ success: true, data: false });
    expect(safeParse(s.null(), null)).toEqual({ success: true, data: null });
    expect(safeParse(s.literal("a"), "a")).toEqual({ success: true, data: "a" });
    expect(safeParse(s.enum(["EUR", "USD"] as const), "EUR")).toEqual({
      success: true,
      data: "EUR",
    });

    expect(safeParse(s.string(), 1).success).toBe(false);
    expect(safeParse(s.int(), 1.5).success).toBe(false);
    expect(safeParse(s.enum(["EUR"] as const), "USD").success).toBe(false);
  });

  it("parses strict flat objects", () => {
    const schema = s.object({ id: s.string(), n: s.int() });
    expect(safeParse(schema, { id: "x", n: 1 })).toEqual({
      success: true,
      data: { id: "x", n: 1 },
    });
    expect(safeParse(schema, { id: "x" }).success).toBe(false);
    expect(safeParse(schema, { id: "x", n: 1, extra: true }).success).toBe(false);
  });

  it("parses key tuples", () => {
    const schema = s.tuple([s.object({ sku: s.string() })]);
    expect(safeParse(schema, [{ sku: "TSHIRT-1" }])).toEqual({
      success: true,
      data: [{ sku: "TSHIRT-1" }],
    });
    expect(safeParse(schema, []).success).toBe(false);
    expect(safeParse(s.tuple([]), [])).toEqual({ success: true, data: [] });
  });

  it("parses unions first-success", () => {
    const schema = s.union([
      s.tuple([s.object({ id: s.string() })]),
      s.tuple([s.object({ userId: s.string() })]),
      s.tuple([]),
    ]);

    expect(safeParse(schema, [{ id: "1" }])).toEqual({
      success: true,
      data: [{ id: "1" }],
    });
    expect(safeParse(schema, [{ userId: "u" }])).toEqual({
      success: true,
      data: [{ userId: "u" }],
    });
    expect(safeParse(schema, [])).toEqual({ success: true, data: [] });
    expect(safeParse(schema, [{ other: "x" }]).success).toBe(false);
  });

  it("infers output types", () => {
    const schema = s.tuple([s.object({ sku: s.string() })]);
    type Out = InferKeySchema<typeof schema>;
    expectTypeOf<Out>().toEqualTypeOf<readonly [{ readonly sku: string }]>();

    const enumSchema = s.enum(["EUR", "USD"] as const);
    expectTypeOf<InferKeySchema<typeof enumSchema>>().toEqualTypeOf<"EUR" | "USD">();
  });
});
