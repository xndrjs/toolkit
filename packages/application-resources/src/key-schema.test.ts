import { describe, expect, expectTypeOf, it } from "vitest";

import { s, safeParse, type InferKeySchema } from "./key-schema";

describe("key schema DSL", () => {
  it("parses leaf schemas", () => {
    expect(safeParse(s.string(), "ok")).toEqual({ success: true, value: "ok" });
    expect(safeParse(s.int(), 3)).toEqual({ success: true, value: 3 });
    expect(safeParse(s.boolean(), false)).toEqual({ success: true, value: false });
    expect(safeParse(s.literal("a"), "a")).toEqual({ success: true, value: "a" });
    expect(safeParse(s.enum(["EUR", "USD"] as const), "EUR")).toEqual({
      success: true,
      value: "EUR",
    });

    expect(safeParse(s.string(), 1).success).toBe(false);
    expect(safeParse(s.int(), 1.5).success).toBe(false);
    expect(safeParse(s.enum(["EUR"] as const), "USD").success).toBe(false);
  });

  it("parses nullable leaves", () => {
    const schema = s.nullable(s.string());
    expect(safeParse(schema, null)).toEqual({ success: true, value: null });
    expect(safeParse(schema, "ok")).toEqual({ success: true, value: "ok" });
    expect(safeParse(schema, 1).success).toBe(false);
  });

  it("parses optional leaves and omits absent object fields", () => {
    const leaf = s.optional(s.string());
    expect(safeParse(leaf, undefined)).toEqual({ success: true, value: undefined });
    expect(safeParse(leaf, "ok")).toEqual({ success: true, value: "ok" });
    expect(safeParse(leaf, null).success).toBe(false);

    const schema = s.object({ id: s.string(), label: s.optional(s.string()) });
    expect(safeParse(schema, { id: "x" })).toEqual({
      success: true,
      value: { id: "x" },
    });
    expect(safeParse(schema, { id: "x", label: undefined })).toEqual({
      success: true,
      value: { id: "x" },
    });
    expect(safeParse(schema, { id: "x", label: "hi" })).toEqual({
      success: true,
      value: { id: "x", label: "hi" },
    });
  });

  it("parses strict flat objects", () => {
    const schema = s.object({ id: s.string(), n: s.int(), userId: s.nullable(s.string()) });
    expect(safeParse(schema, { id: "x", n: 1, userId: null })).toEqual({
      success: true,
      value: { id: "x", n: 1, userId: null },
    });
    expect(safeParse(schema, { id: "x", n: 1, userId: "u" })).toEqual({
      success: true,
      value: { id: "x", n: 1, userId: "u" },
    });
    expect(safeParse(schema, { id: "x" }).success).toBe(false);
    expect(safeParse(schema, { id: "x", n: 1, extra: true }).success).toBe(false);
  });

  it("parses key tuples", () => {
    const schema = s.tuple([s.object({ sku: s.string() })]);
    expect(safeParse(schema, [{ sku: "TSHIRT-1" }])).toEqual({
      success: true,
      value: [{ sku: "TSHIRT-1" }],
    });
    expect(safeParse(schema, []).success).toBe(false);
    expect(safeParse(s.tuple([]), [])).toEqual({ success: true, value: [] });
  });

  it("parses wire keys for transport shape", () => {
    const schema = s.wireKey();
    expect(safeParse(schema, [])).toEqual({ success: true, value: [] });
    expect(safeParse(schema, [{ id: "1" }, "scope", 42, true, null])).toEqual({
      success: true,
      value: [{ id: "1" }, "scope", 42, true, null],
    });
    expect(safeParse(schema, [[1]]).success).toBe(false);
    expect(safeParse(schema, [{ nested: { id: "1" } }]).success).toBe(false);
    expect(safeParse(schema, "not-array").success).toBe(false);
  });

  it("parses unions first-success", () => {
    const schema = s.union([
      s.tuple([s.object({ id: s.string() })]),
      s.tuple([s.object({ userId: s.string() })]),
      s.tuple([]),
    ]);

    expect(safeParse(schema, [{ id: "1" }])).toEqual({
      success: true,
      value: [{ id: "1" }],
    });
    expect(safeParse(schema, [{ userId: "u" }])).toEqual({
      success: true,
      value: [{ userId: "u" }],
    });
    expect(safeParse(schema, [])).toEqual({ success: true, value: [] });
    expect(safeParse(schema, [{ other: "x" }]).success).toBe(false);
  });

  it("infers output types", () => {
    const _schema = s.tuple([s.object({ sku: s.string() })]);
    type Out = InferKeySchema<typeof _schema>;
    expectTypeOf<Out[number]>().toEqualTypeOf<{ readonly sku: string }>();

    const _enumSchema = s.enum(["EUR", "USD"] as const);
    expectTypeOf<InferKeySchema<typeof _enumSchema>>().toEqualTypeOf<"EUR" | "USD">();

    const _nullableSchema = s.object({ userId: s.nullable(s.string()) });
    expectTypeOf<InferKeySchema<typeof _nullableSchema>>().toEqualTypeOf<{
      readonly userId: string | null;
    }>();

    const _optionalSchema = s.object({ id: s.string(), label: s.optional(s.string()) });
    expectTypeOf<InferKeySchema<typeof _optionalSchema>>().toEqualTypeOf<{
      readonly id: string;
      readonly label?: string;
    }>();
  });
});
