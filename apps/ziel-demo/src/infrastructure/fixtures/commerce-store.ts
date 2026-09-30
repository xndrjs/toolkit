/**
 * In-memory commerce fixtures for the non-CMS ProductDetail vertical.
 */
import {
  Scalars,
  type CatalogProductPayload,
  type OfferPricePayload,
  type ProductMediaPayload,
  type StockLevelPayload,
} from "../../generated";

export const DEMO_MARKET = Scalars.Market("eu");
export const DEMO_TENANT = Scalars.TenantId("acme");
export const DEMO_PRODUCT_ID = Scalars.CatalogProductId("sku-tee-001");
export const DEMO_PRICE_ID = Scalars.PriceId("price-tee-eu");
export const DEMO_INVENTORY_SKU = Scalars.InventorySku("TEE-001");
export const DEMO_MEDIA_ID = Scalars.MediaId("media-tee-front");
export const DEMO_WAREHOUSE = "eu-central";

export const demoCatalogProducts = new Map<string, CatalogProductPayload>([
  [
    `${DEMO_PRODUCT_ID}/${DEMO_MARKET}/en-US`,
    {
      id: DEMO_PRODUCT_ID,
      title: "Organic tee",
      priceId: DEMO_PRICE_ID,
      sku: DEMO_INVENTORY_SKU,
      mediaId: DEMO_MEDIA_ID,
    },
  ],
]);

export const demoPrices = new Map<string, OfferPricePayload>([
  [
    `${DEMO_PRICE_ID}/${DEMO_MARKET}`,
    {
      id: DEMO_PRICE_ID,
      amountCents: 2990,
      currency: "EUR",
    },
  ],
]);

export const demoStock = new Map<string, StockLevelPayload>([
  [
    `${DEMO_INVENTORY_SKU}/${DEMO_WAREHOUSE}`,
    {
      sku: DEMO_INVENTORY_SKU,
      available: 42,
    },
  ],
]);

export const demoMedia = new Map<string, ProductMediaPayload>([
  [
    DEMO_MEDIA_ID,
    {
      id: DEMO_MEDIA_ID,
      url: "https://cdn.example/tee-front.webp",
      alt: "Organic tee front",
    },
  ],
]);
