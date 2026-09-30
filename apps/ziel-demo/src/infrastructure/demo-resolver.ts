import type { EditorialDocument } from "./fixtures/store.js";
import { loadCmsAssets } from "./cms/asset-data-adapter.js";
import { loadCmsCustomReferences } from "./cms/custom-reference-data-adapter.js";
import { loadCmsEntries } from "./cms/entries-data-adapter.js";
import { loadErrorLabStore } from "./cms/error-lab-data-adapter.js";
import { loadCatalogProducts } from "./commerce/catalog-data-adapter.js";
import { loadOfferPrices } from "./commerce/pricing-data-adapter.js";
import { loadStockLevels } from "./commerce/inventory-data-adapter.js";
import { loadProductMedia } from "./commerce/media-data-adapter.js";
import {
  createErrorHandlingDetailDataSources,
  createPageDetailDataSources,
  createProductDetailDataSources,
  resolveErrorHandlingDetail,
  resolvePageDetail,
  resolveProductDetail,
  type AssetPayload,
  type CatalogProductPayload,
  type ErrorLabPayload,
  type OfferPricePayload,
  type ProductMediaPayload,
  type ResolveErrorHandlingDetailInput,
  type ResolveErrorHandlingDetailResult,
  type ResolvePageDetailInput,
  type ResolvePageDetailResult,
  type ResolveProductDetailInput,
  type ResolveProductDetailResult,
  type StockLevelPayload,
} from "../generated";

export type DemoSourcesOptions = {
  entries?: ReadonlyMap<string, EditorialDocument>;
  errorLabs?: ReadonlyMap<string, ErrorLabPayload>;
  assets?: ReadonlyMap<string, AssetPayload>;
  catalogProducts?: ReadonlyMap<string, CatalogProductPayload>;
  prices?: ReadonlyMap<string, OfferPricePayload>;
  stock?: ReadonlyMap<string, StockLevelPayload>;
  media?: ReadonlyMap<string, ProductMediaPayload>;
};

/** PageDetail sources (CMS entries / assets / custom refs). */
export function createDemoPageDetailSources(options: DemoSourcesOptions = {}) {
  return createPageDetailDataSources({
    CmsCustomReferences: { load: loadCmsCustomReferences },
    CmsEntries: { load: loadCmsEntries(options.entries) },
    CmsAssets: { load: loadCmsAssets(options.assets) },
  });
}

/** ErrorHandlingDetail sources (ErrorLab + Entry + Asset). */
export function createDemoErrorHandlingDetailSources(options: DemoSourcesOptions = {}) {
  return createErrorHandlingDetailDataSources({
    CmsEntries: { load: loadCmsEntries(options.entries) },
    ErrorLabStore: { load: loadErrorLabStore(options.errorLabs) },
    CmsAssets: { load: loadCmsAssets(options.assets) },
  });
}

/** ProductDetail sources (catalog + pricing + inventory + media). */
export function createDemoProductDetailSources(options: DemoSourcesOptions = {}) {
  return createProductDetailDataSources({
    CatalogApi: { load: loadCatalogProducts(options.catalogProducts) },
    PricingApi: { load: loadOfferPrices(options.prices) },
    InventoryApi: { load: loadStockLevels(options.stock) },
    MediaCdn: { load: loadProductMedia(options.media) },
  });
}

export type DemoResolveOptions = Omit<ResolvePageDetailInput, "sources"> & DemoSourcesOptions;

/** Closed façade: generated `resolvePageDetail` + demo DataSources. */
export function resolveDemoPageDetail(
  options: DemoResolveOptions
): Promise<ResolvePageDetailResult> {
  const { entries, errorLabs, assets, catalogProducts, prices, stock, media, ...input } = options;
  return resolvePageDetail({
    ...input,
    sources: createDemoPageDetailSources({
      entries,
      errorLabs,
      assets,
      catalogProducts,
      prices,
      stock,
      media,
    }),
  });
}

export type DemoResolveErrorHandlingOptions = Omit<ResolveErrorHandlingDetailInput, "sources"> &
  DemoSourcesOptions;

/** Closed façade: generated `resolveErrorHandlingDetail` + demo DataSources. */
export function resolveDemoErrorHandlingDetail(
  options: DemoResolveErrorHandlingOptions
): Promise<ResolveErrorHandlingDetailResult> {
  const { entries, errorLabs, assets, catalogProducts, prices, stock, media, ...input } = options;
  return resolveErrorHandlingDetail({
    ...input,
    sources: createDemoErrorHandlingDetailSources({
      entries,
      errorLabs,
      assets,
      catalogProducts,
      prices,
      stock,
      media,
    }),
  });
}

export type DemoResolveProductOptions = Omit<ResolveProductDetailInput, "sources"> &
  DemoSourcesOptions;

/** Non-CMS product detail: catalog + price + inventory + media. */
export function resolveDemoProductDetail(
  options: DemoResolveProductOptions
): Promise<ResolveProductDetailResult> {
  const { entries, errorLabs, assets, catalogProducts, prices, stock, media, ...input } = options;
  return resolveProductDetail({
    ...input,
    sources: createDemoProductDetailSources({
      entries,
      errorLabs,
      assets,
      catalogProducts,
      prices,
      stock,
      media,
    }),
  });
}
