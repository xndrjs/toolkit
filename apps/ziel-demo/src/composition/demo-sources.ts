import type { EditorialDocument } from "../infrastructure/fixtures/cms-store.js";
import type { AssetPayloadWire } from "../infrastructure/cms/schemas/asset.js";
import type { ErrorLabPayloadWire } from "../infrastructure/cms/schemas/error-lab.js";
import type { TaxonomyTermPayloadWire } from "../infrastructure/cms/schemas/taxonomy-term.js";
import type { CatalogProductPayloadWire } from "../infrastructure/commerce/schemas/catalog-product.js";
import type { OfferPricePayloadWire } from "../infrastructure/commerce/schemas/offer-price.js";
import type { ProductMediaPayloadWire } from "../infrastructure/commerce/schemas/product-media.js";
import type { StockLevelPayloadWire } from "../infrastructure/commerce/schemas/stock-level.js";
import { loadCmsAssets } from "../infrastructure/cms/asset-data-adapter.js";
import { loadCmsCustomReferences } from "../infrastructure/cms/custom-reference-data-adapter.js";
import { loadCmsEntries } from "../infrastructure/cms/entries-data-adapter.js";
import { loadErrorLabStore } from "../infrastructure/cms/error-lab-data-adapter.js";
import { loadCmsTaxonomyTerms } from "../infrastructure/cms/taxonomy-term-data-adapter.js";
import { loadCatalogProducts } from "../infrastructure/commerce/catalog-data-adapter.js";
import { loadOfferPrices } from "../infrastructure/commerce/pricing-data-adapter.js";
import { loadStockLevels } from "../infrastructure/commerce/inventory-data-adapter.js";
import { loadProductMedia } from "../infrastructure/commerce/media-data-adapter.js";
import {
  createErrorHandlingDetailDataSources,
  createPageDetailDataSources,
  createProductDetailDataSources,
  resolveErrorHandlingDetail,
  resolvePageDetail,
  resolveProductDetail,
  type ResolveErrorHandlingDetailInput,
  type ResolveErrorHandlingDetailResult,
  type ResolvePageDetailInput,
  type ResolvePageDetailResult,
  type ResolveProductDetailInput,
  type ResolveProductDetailResult,
} from "../generated";

export type DemoSourcesOptions = {
  entries?: ReadonlyMap<string, EditorialDocument>;
  errorLabs?: ReadonlyMap<string, ErrorLabPayloadWire>;
  assets?: ReadonlyMap<string, AssetPayloadWire>;
  taxonomyTerms?: ReadonlyMap<string, TaxonomyTermPayloadWire>;
  catalogProducts?: ReadonlyMap<string, CatalogProductPayloadWire>;
  prices?: ReadonlyMap<string, OfferPricePayloadWire>;
  stock?: ReadonlyMap<string, StockLevelPayloadWire>;
  media?: ReadonlyMap<string, ProductMediaPayloadWire>;
};

/** PageDetail sources (CMS entries / assets / custom refs / taxonomy). */
export function createDemoPageDetailSources(options: DemoSourcesOptions = {}) {
  return createPageDetailDataSources({
    CmsCustomReferences: { load: loadCmsCustomReferences },
    CmsEntries: { load: loadCmsEntries(options.entries) },
    CmsAssets: { load: loadCmsAssets(options.assets) },
    CmsTaxonomyTerms: { load: loadCmsTaxonomyTerms(options.taxonomyTerms) },
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
  const {
    entries,
    errorLabs,
    assets,
    taxonomyTerms,
    catalogProducts,
    prices,
    stock,
    media,
    ...input
  } = options;
  return resolvePageDetail({
    ...input,
    sources: createDemoPageDetailSources({
      entries,
      errorLabs,
      assets,
      taxonomyTerms,
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
