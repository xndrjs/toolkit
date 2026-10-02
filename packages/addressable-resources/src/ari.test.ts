import { describe, expect, expectTypeOf, it } from "vitest";

import { ari, AriKeySchemaError, AriParseError } from "./ari";
import { createAri } from "./create-ari";
import { s } from "./key-schema";

describe("ari factory", () => {
  const integrationProductAri = ari("integration.product", s.object({ sku: s.string() }));

  it("creates a typed ARI when the key matches the schema", () => {
    const resource = integrationProductAri({ sku: "TSHIRT-1" });

    expect(resource.type).toBe("integration.product");
    expect(resource.key).toEqual({ sku: "TSHIRT-1" });
    expectTypeOf(resource.type).toEqualTypeOf<"integration.product">();
    expectTypeOf(resource.key.sku).toEqualTypeOf<string>();
  });

  it("throws AriKeySchemaError when create key is invalid", () => {
    expect(() => integrationProductAri({ sku: 1 as unknown as string })).toThrow(AriKeySchemaError);
  });

  it("matches candidates by type and key shape", () => {
    const ok = integrationProductAri({ sku: "TSHIRT-1" });
    const wrongType = createAri("other", { sku: "TSHIRT-1" });
    const wrongKey = createAri("integration.product", { id: "x" });

    expect(integrationProductAri.matches(ok)).toBe(true);
    expect(integrationProductAri.matches(wrongType)).toBe(false);
    expect(integrationProductAri.matches(wrongKey)).toBe(false);

    if (integrationProductAri.matches(ok)) {
      expectTypeOf(ok.key.sku).toEqualTypeOf<string>();
    }
  });

  it("exposes type and the object identity schema (not a tuple)", () => {
    expect(integrationProductAri.type).toBe("integration.product");
    expect(integrationProductAri.keySchema.kind).toBe("object");
    expect(Object.keys(integrationProductAri.keySchema.shape)).toEqual(["sku"]);
  });

  it("rejects multi-schema / empty-key factory forms at the type level", () => {
    // @ts-expect-error -- ari requires exactly one object identity schema
    ari("posts");

    // @ts-expect-error -- multi-segment schemas are not allowed
    ari("scoped", s.object({ id: s.string() }), s.literal("v1"));

    // @ts-expect-error -- leaf schemas are not identity keys
    ari("count", s.int());
  });

  it("rejects types that contain parentheses", () => {
    expect(() => ari("bad(type)", s.object({ id: s.string() }))).toThrow(/must not contain/);
  });

  it("parseString round-trips toString()", () => {
    const resource = integrationProductAri({ sku: "TSHIRT-1" });
    const parsed = integrationProductAri.parseString(resource.toString());

    expect(parsed.equals(resource)).toBe(true);
    expect(parsed.key).toEqual(resource.key);
  });

  it("safeParseString returns structured issues", () => {
    const resource = integrationProductAri({ sku: "TSHIRT-1" });
    const ok = integrationProductAri.safeParseString(resource.toString());
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.value.equals(resource)).toBe(true);
    }

    const invalidSku = integrationProductAri.safeParseString(
      createAri("integration.product", { sku: 1 as unknown as string }).toString()
    );
    expect(invalidSku.success).toBe(false);
    if (!invalidSku.success) {
      expect(invalidSku.issues[0]?.path).toEqual(["sku"]);
    }

    const wrongType = integrationProductAri.safeParseString(
      createAri("other", { sku: "x" }).toString()
    );
    expect(wrongType.success).toBe(false);
    if (!wrongType.success) {
      expect(wrongType.issues[0]?.path).toEqual(["type"]);
    }

    expect(integrationProductAri.safeParseString("not-an-ari").success).toBe(false);
  });

  it("parseString throws on invalid input", () => {
    expect(() => integrationProductAri.parseString("bad")).toThrow(AriParseError);
    expect(() =>
      integrationProductAri.parseString(createAri("other", { sku: "x" }).toString())
    ).toThrow(AriParseError);
  });
});
