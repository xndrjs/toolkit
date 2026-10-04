/**
 * In-memory commerce fixtures for the non-CMS ProductDetail vertical.
 * Documents are wire shapes; branded scalars stay at orchestration input.
 */
import { Scalars } from "../../generated/resources";
import type { CatalogProductPayloadWire } from "../commerce/schemas/catalog-product.js";
import type { OfferPricePayloadWire } from "../commerce/schemas/offer-price.js";
import type { ProductMediaPayloadWire } from "../commerce/schemas/product-media.js";
import type { StockLevelPayloadWire } from "../commerce/schemas/stock-level.js";

export const DEMO_MARKET = Scalars.Market("eu");
export const DEMO_TENANT = Scalars.TenantId("acme");
export const DEMO_PRODUCT_ID = Scalars.CatalogProductId("sku-tee-001");
export const DEMO_PRICE_ID = Scalars.PriceId("price-tee-eu");
export const DEMO_INVENTORY_SKU = Scalars.InventorySku("TEE-001");
export const DEMO_MEDIA_ID = Scalars.MediaId("media-tee-front");
export const DEMO_WAREHOUSE = "eu-central";

export const demoCatalogProducts: ReadonlyMap<string, CatalogProductPayloadWire> = new Map([
  [
    `${DEMO_PRODUCT_ID}/${DEMO_MARKET}/en-US`,
    {
      id: "sku-tee-001",
      title: "Organic tee",
      priceId: "price-tee-eu",
      sku: "TEE-001",
      mediaId: "media-tee-front",
    },
  ],
]);

export const demoPrices: ReadonlyMap<string, OfferPricePayloadWire> = new Map([
  [
    `${DEMO_PRICE_ID}/${DEMO_MARKET}`,
    {
      id: "price-tee-eu",
      amountCents: 2990,
      currency: "EUR",
    },
  ],
]);

export const demoStock: ReadonlyMap<string, StockLevelPayloadWire> = new Map([
  [
    `${DEMO_INVENTORY_SKU}/${DEMO_WAREHOUSE}`,
    {
      sku: "TEE-001",
      available: 42,
    },
  ],
]);

export const demoMedia: ReadonlyMap<string, ProductMediaPayloadWire> = new Map([
  [
    DEMO_MEDIA_ID,
    {
      id: "media-tee-front",
      url: "https://cdn.example/tee-front.webp",
      alt: "Organic tee front",
    },
  ],
]);
