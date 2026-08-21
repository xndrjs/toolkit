import { describe, expect, expectTypeOf, it } from "vitest";

import { ari } from "./ari";
import { AriKeySchemaError, defineAri } from "./define-ari";
import { s } from "./key-schema";

describe("defineAri", () => {
  const integrationProductAri = defineAri(
    "integration.product",
    s.tuple([s.object({ sku: s.string() })])
  );

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
    const wrongType = ari("other", { sku: "TSHIRT-1" });
    const wrongKey = ari("integration.product", { id: "x" });

    expect(integrationProductAri.matches(ok)).toBe(true);
    expect(integrationProductAri.matches(wrongType)).toBe(false);
    expect(integrationProductAri.matches(wrongKey)).toBe(false);

    if (integrationProductAri.matches(ok)) {
      expectTypeOf(ok.key[0].sku).toEqualTypeOf<string>();
    }
  });

  it("exposes type and keySchema", () => {
    expect(integrationProductAri.type).toBe("integration.product");
    expect(integrationProductAri.keySchema.kind).toBe("tuple");
  });

  it("supports empty family keys and multi-locator unions", () => {
    const postsById = defineAri("posts", s.tuple([s.object({ id: s.string() })]));
    const postsAll = defineAri("posts", s.tuple([]));
    const postsLocator = defineAri(
      "posts",
      s.union([s.tuple([s.object({ id: s.string() })]), s.tuple([])])
    );

    expect(postsById({ id: "1" }).key).toEqual([{ id: "1" }]);
    expect(postsAll().key).toEqual([]);
    expect(postsLocator.matches(postsById({ id: "1" }))).toBe(true);
    expect(postsLocator.matches(postsAll())).toBe(true);
  });
});
