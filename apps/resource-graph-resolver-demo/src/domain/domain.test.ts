import { describe, expect, expectTypeOf, it } from "vitest";

import {
  HeroShape,
  PageShape,
  PriceShape,
  ProductShape,
  TabShape,
  type Hero,
  type PageModule,
  type Product,
  type TabStrip,
} from "./index.js";

describe("domain shapes", () => {
  it("requires discriminant type on create input", () => {
    expectTypeOf(HeroShape.create).parameter(0).toHaveProperty("type").toEqualTypeOf<"Hero">();
    expectTypeOf<Hero["type"]>().toEqualTypeOf<"Hero">();
  });

  it("creates aggregated Product with Price and availability", () => {
    const product = ProductShape.create({
      type: "Product",
      id: "product-1",
      sku: "SKU-100",
      title: "Trail bottle",
      description: "Insulated",
      price: { type: "Price", amount: 2499, currency: "EUR" },
      availability: true,
    });

    expect(product.type).toBe("Product");
    expect(product.sku).toBe("SKU-100");
    expect(PriceShape.is(product.price)).toBe(true);
    expect(product.price.amount).toBe(2499);
    expect(product.price.currency).toBe("EUR");
    expect(product.availability).toBe(true);
    expect(ProductShape.is(product)).toBe(true);
  });

  it("accepts polymorphic Tab.strips as Hero | Product", () => {
    const hero = HeroShape.create({
      type: "Hero",
      id: "hero-1",
      title: "Welcome",
      image: { type: "Asset", id: "asset-1", url: "https://cdn.example/hero.jpg", title: null },
    });
    const product = ProductShape.create({
      type: "Product",
      id: "product-1",
      sku: "SKU-100",
      title: "Trail bottle",
      description: null,
      price: { type: "Price", amount: 1999, currency: "USD" },
      availability: false,
    });

    const tab = TabShape.create({
      type: "Tab",
      id: "tab-1",
      title: "Featured",
      strips: [hero, product],
    });

    expect(tab.strips).toHaveLength(2);
    expect(tab.strips[0]!.type).toBe("Hero");
    expect(tab.strips[1]!.type).toBe("Product");

    const strips: readonly TabStrip[] = tab.strips;
    expectTypeOf(strips).toExtend<readonly TabStrip[]>();
    expect(HeroShape.is(strips[0]!)).toBe(true);
    expect(ProductShape.is(strips[1]!)).toBe(true);
  });

  it("accepts polymorphic Page.modules as Tabs | Hero | Product", () => {
    const page = PageShape.create({
      type: "Page",
      id: "page-1",
      title: "Home",
      modules: [
        {
          type: "Tabs",
          id: "tabs-1",
          title: null,
          tabs: [
            {
              type: "Tab",
              id: "tab-1",
              title: "One",
              strips: [
                {
                  type: "Hero",
                  id: "hero-1",
                  title: null,
                  image: { type: "Asset", id: "a1", url: "https://cdn.example/a.jpg", title: "A" },
                },
              ],
            },
          ],
        },
        {
          type: "Hero",
          id: "hero-2",
          title: "Banner",
          image: { type: "Asset", id: "a2", url: "https://cdn.example/b.jpg", title: null },
        },
        {
          type: "Product",
          id: "product-1",
          sku: "SKU-200",
          title: "Kit",
          description: null,
          price: { type: "Price", amount: 5000, currency: "GBP" },
          availability: true,
        },
      ],
      menu: null,
      footer: {
        type: "Footer",
        id: "footer-1",
        title: "Footer",
        logo: { type: "Asset", id: "logo-1", url: "https://cdn.example/logo.svg", title: null },
      },
    });

    expect(page.modules.map((m) => m.type)).toEqual(["Tabs", "Hero", "Product"]);
    const modules: readonly PageModule[] = page.modules;
    expectTypeOf(modules).toExtend<readonly PageModule[]>();
    expectTypeOf(page.modules[1]!).toExtend<Hero | Product | (typeof page.modules)[number]>();
  });
});
