/** Money payload returned by the product integration (not CMS). */
export type ProductIntegrationPrice = {
  amount: number;
  currency: "EUR" | "USD" | "GBP";
};

/** Price + stock for one SKU — payload of `integration.product`. */
export type ProductIntegrationSnapshot = {
  price: ProductIntegrationPrice;
  inStock: boolean;
};

/** SKU shared with the CMS product fixture (`demoIds.productSku`). */
export const demoProductSku = "TSHIRT-1" as const;

/** Demo catalog keyed by SKU (feeds the in-memory integration adapter). */
export const demoProductCatalog: ReadonlyMap<string, ProductIntegrationSnapshot> = new Map([
  [
    demoProductSku,
    {
      price: { amount: 1999, currency: "EUR" },
      inStock: true,
    },
  ],
]);
