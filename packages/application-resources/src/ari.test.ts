import { describe, expect, expectTypeOf, it } from "vitest";

import { ari, AriKeySchemaError, AriParseError } from "./ari";
import { createAri } from "./create-ari";
import { s } from "./key-schema";

describe("ari factory", () => {
  const integrationProductAri = ari("integration.product", s.object({ sku: s.string() }));

  it("creates a typed ARI when the key matches the schema", () => {
    const resource = integrationProductAri({ sku: "TSHIRT-1" });

    expect(resource.type).toBe("integration.product");
    expect(resource.key).toEqual([{ sku: "TSHIRT-1" }]);
    expectTypeOf(resource.type).toEqualTypeOf<"integration.product">();
    expectTypeOf(resource.key[0]!.sku).toEqualTypeOf<string>();
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
      expectTypeOf(ok.key[0].sku).toEqualTypeOf<string>();
    }
  });

  it("exposes type and keySchema as an auto-wrapped tuple", () => {
    expect(integrationProductAri.type).toBe("integration.product");
    expect(integrationProductAri.keySchema.kind).toBe("tuple");
    expect(integrationProductAri.keySchema.items).toHaveLength(1);
  });

  it("supports empty family keys and multi-part keys via rest schemas", () => {
    const postsAll = ari("posts");
    const postsById = ari("posts", s.object({ id: s.string() }));
    const scoped = ari("scoped", s.object({ id: s.string() }), s.literal("v1"));

    expect(postsAll().key).toEqual([]);
    expect(postsById({ id: "1" }).key).toEqual([{ id: "1" }]);
    expect(scoped({ id: "1" }, "v1").key).toEqual([{ id: "1" }, "v1"]);
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
      expect(invalidSku.issues[0]?.path).toEqual([0, "sku"]);
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
